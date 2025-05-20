// Copyright 2024-2025 Andres Morey
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package k8shelpers

import (
	"context"
	"fmt"
	"slices"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"
	authv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/utils/ptr"

	"github.com/kubetail-org/kubetail/modules/shared/graphql/errors"
)

// Represent permissions
var (
	AllNamespacesPermittedList = []string{""}
)

// Use this ptr to bypass namespace checks
var BypassNamespaceCheck = ptr.To("")

// Permissions-aware namespace pointer dereferencer:
//   - If namespace pointer is nil, will use given default namepace
//   - Before returning value, will cross-reference with permitted namespaces
//   - If all namespaces is requested ("") but user does not have cluster scope permission, will
//     return permission error
func DerefNamespace(permittedNamespaces []string, namespace *string, defaultNamespace string) (string, error) {
	ns := ptr.Deref(namespace, defaultNamespace)

	// bypass auth
	if namespace == BypassNamespaceCheck {
		return ns, nil
	}

	// perform auth
	if !slices.Equal(permittedNamespaces, AllNamespacesPermittedList) && !slices.Contains(permittedNamespaces, ns) {
		return "", errors.ErrForbidden
	}

	return ns, nil
}

// Permissions-aware namespace pointer dereferencer to list:
//   - If pointer is nil, will use given default namepace
//   - Before returning values, will cross-reference with permitted namespaces
//   - If all namespaces is requested ("") but user does not have cluster scope permission, will
//     return list of permitted namespaces or permission error if none
func DerefNamespaceToList(permittedNamespaces []string, namespace *string, defaultNamespace string) ([]string, error) {
	ns := ptr.Deref(namespace, defaultNamespace)

	// Bypass auth
	if namespace == BypassNamespaceCheck {
		return AllNamespacesPermittedList, nil
	}

	// If any namespace allowed, listify input and return
	if slices.Equal(permittedNamespaces, AllNamespacesPermittedList) {
		return []string{ns}, nil
	}

	// If user requests all namespaces, return explicit list of permitted namespaces
	if ns == "" {
		return permittedNamespaces, nil
	}

	// If namespace is forbidden, return error
	if !slices.Contains(permittedNamespaces, ns) {
		return nil, errors.ErrForbidden
	}

	// Listify
	return []string{ns}, nil
}

// Cache entry with expiration
type pnpCacheEntry struct {
	data       []string
	expiration time.Time
}

// Represents PermittedNamespacesProvider interface
type PermittedNamespacesProvider interface {
	List(ctx context.Context, kubeContext string) ([]string, error)
}

// Represents DefaultPermittedNamespacesProvider
type DefaultPermittedNamespacesProvider struct {
	cm                ConnectionManager
	allowedNamespaces []string
	cache             sync.Map
	locks             sync.Map
	cacheTTL          time.Duration
}

// Initalize new DefaultPermittedNamespacesProvider
func NewPermittedNamespacesProvider(cm ConnectionManager, allowedNamespaces []string) *DefaultPermittedNamespacesProvider {
	return &DefaultPermittedNamespacesProvider{
		cm:                cm,
		allowedNamespaces: allowedNamespaces,
		cacheTTL:          5 * time.Minute, // Default TTL of 5 minutes
	}
}

// Returns list of permitted namespaces
func (p *DefaultPermittedNamespacesProvider) List(ctx context.Context, kubeContext string) ([]string, error) {
	// Get token (if available) for cache key
	token, ok := ctx.Value(K8STokenCtxKey).(string)
	if !ok {
		token = ""
	}
	cacheKey := fmt.Sprintf("%s/%s", kubeContext, token)

	// Get lock
	lock, _ := p.locks.LoadOrStore(cacheKey, &sync.Mutex{})
	mu := lock.(*sync.Mutex)
	mu.Lock()
	defer mu.Unlock()

	// Check cache
	if val, ok := p.cache.Load(cacheKey); ok {
		entry := val.(pnpCacheEntry)
		if time.Now().Before(entry.expiration) {
			return entry.data, nil
		}
		// Cache expired, remove it
		p.cache.Delete(cacheKey)
	}

	// Get clientset
	clientset, err := p.cm.GetOrCreateClientset(kubeContext)
	if err != nil {
		return nil, err
	}

	// Check if user has access to cluster scope
	clusterScopeAllowed, err := p.doSSAR(ctx, clientset, "")
	if err != nil {
		return nil, err
	}

	// If user has access to cluster scope, return allowed namespaces
	if clusterScopeAllowed {
		if len(p.allowedNamespaces) != 0 {
			return p.allowedNamespaces, nil
		}
		return AllNamespacesPermittedList, nil
	}

	// Otherwise, check individual namespaces
	var availableNamespaces []string
	if len(p.allowedNamespaces) == 0 {
		// Get all namespaces from API
		namespaceList, err := clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}

		availableNamespaces = make([]string, len(namespaceList.Items))
		for i, ns := range namespaceList.Items {
			availableNamespaces[i] = ns.Name
		}
	} else {
		availableNamespaces = p.allowedNamespaces
	}

	// Make individual requests in an error group
	g, ctx := errgroup.WithContext(ctx)

	ch := make(chan string, len(availableNamespaces))
	for _, namespace := range availableNamespaces {
		namespace := namespace
		g.Go(func() error {
			allowed, err := p.doSSAR(ctx, clientset, namespace)
			if err != nil {
				return err
			}

			if allowed {
				ch <- namespace
			}

			return nil
		})
	}

	if err := g.Wait(); err != nil {
		close(ch)
		return nil, err
	}
	close(ch)

	// gather responses
	permittedNamespaces := []string{}
	for namespace := range ch {
		permittedNamespaces = append(permittedNamespaces, namespace)
	}

	// Store in cache
	p.cache.Store(cacheKey, pnpCacheEntry{
		data:       permittedNamespaces,
		expiration: time.Now().Add(p.cacheTTL),
	})

	return permittedNamespaces, nil
}

// PermittedNamespacesProvider self-subject-access-review helper func
func (*DefaultPermittedNamespacesProvider) doSSAR(ctx context.Context, clientset kubernetes.Interface, namespace string) (bool, error) {
	sar := &authv1.SelfSubjectAccessReview{
		Spec: authv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authv1.ResourceAttributes{
				Namespace: namespace,
				Group:     "",
				Verb:      "list",
				Resource:  "pods",
			},
		},
	}

	result, err := clientset.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, sar, metav1.CreateOptions{})
	if err != nil {
		return false, err
	}

	return result.Status.Allowed, nil
}
