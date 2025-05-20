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

	"github.com/kubetail-org/kubetail/modules/shared/graphql/errors"
)

// Represent permissions
var AllNamespacesPermittedList = []string{""}

// Represents NamespaceResolver interface
type NamespaceResolver interface {
	DerefNamespace(ctx context.Context, kubeContext string, namespace *string) (string, error)
	DerefNamespaceToList(ctx context.Context, kubeContext string, namespace *string) ([]string, error)
	GetPermittedNamespaces(ctx context.Context, kubeContext string) ([]string, error)
}

// Represents DefaultNamespaceResolver
type DefaultNamespaceResolver struct {
	cm       ConnectionManager
	provider permittedNamespacesProvider
}

// Initalize new DefaultNamespaceResolver
func NewNamespaceResolver(cm ConnectionManager, allowedNamespaces []string) *DefaultNamespaceResolver {
	return &DefaultNamespaceResolver{
		cm:       cm,
		provider: newPermittedNamespacesProvider(cm, allowedNamespaces),
	}
}

// Permissions-aware namespace pointer dereferencer:
//   - If namespace pointer is nil, will use given default namepace
//   - Before returning value, will cross-reference with permitted namespaces
//   - If all namespaces is requested ("") but user does not have cluster scope permission, will
//     return permission error
func (p *DefaultNamespaceResolver) DerefNamespace(ctx context.Context, kubeContext string, namespace *string) (string, error) {
	// Get permitted namespaces
	permittedNamespaces, err := p.provider.GetList(ctx, kubeContext)
	if err != nil {
		return "", err
	}

	// None permitted
	if len(permittedNamespaces) == 0 {
		return "", errors.ErrForbidden
	}

	var allowedNamespaces []string
	if !slices.Equal(permittedNamespaces, AllNamespacesPermittedList) {
		allowedNamespaces = permittedNamespaces
	}

	return DerefNamespace(allowedNamespaces, namespace, p.cm.GetDefaultNamespace(kubeContext))
}

// Permissions-aware namespace pointer dereferencer to list:
//   - If pointer is nil, will use given default namepace
//   - Before returning values, will cross-reference with permitted namespaces
//   - If all namespaces is requested ("") but user does not have cluster scope permission, will
//     return list of permitted namespaces or permission error if none
func (p *DefaultNamespaceResolver) DerefNamespaceToList(ctx context.Context, kubeContext string, namespace *string) ([]string, error) {
	// Get permitted namespaces
	permittedNamespaces, err := p.provider.GetList(ctx, kubeContext)
	if err != nil {
		return nil, err
	}

	// None permitted
	if len(permittedNamespaces) == 0 {
		return nil, errors.ErrForbidden
	}

	var allowedNamespaces []string
	if !slices.Equal(permittedNamespaces, AllNamespacesPermittedList) {
		allowedNamespaces = permittedNamespaces
	}

	return DerefNamespaceToList(allowedNamespaces, namespace, p.cm.GetDefaultNamespace(kubeContext))
}

// Returns list of permitted namespaces
func (p *DefaultNamespaceResolver) GetPermittedNamespaces(ctx context.Context, kubeContext string) ([]string, error) {
	return p.provider.GetList(ctx, kubeContext)
}

// Cache entry with expiration
type pnpCacheEntry struct {
	data       []string
	expiration time.Time
}

// Represents permittedNamespacesProvider interface
type permittedNamespacesProvider interface {
	GetList(ctx context.Context, kubeContext string) ([]string, error)
}

// Represents defaultPermittedNamespacesProvider struct
type defaultPermittedNamespacesProvider struct {
	cm                ConnectionManager
	allowedNamespaces []string
	cache             sync.Map
	locks             sync.Map
	cacheTTL          time.Duration
}

// Returns new instance of permitted namespaces provider
func newPermittedNamespacesProvider(cm ConnectionManager, allowedNamespaces []string) permittedNamespacesProvider {
	return &defaultPermittedNamespacesProvider{
		cm:                cm,
		allowedNamespaces: allowedNamespaces,
		cacheTTL:          5 * time.Minute, // Default TTL of 5 minutes
	}
}

// Executes request, returns list
func (p *defaultPermittedNamespacesProvider) GetList(ctx context.Context, kubeContext string) ([]string, error) {
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

// Execute self-subject-access-review
func (r *defaultPermittedNamespacesProvider) doSSAR(ctx context.Context, clientset kubernetes.Interface, namespace string) (bool, error) {
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
