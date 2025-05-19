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
	"slices"

	"golang.org/x/sync/errgroup"
	authv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/utils/ptr"

	"github.com/kubetail-org/kubetail/modules/shared/graphql/errors"
)

// Represents all namespaces
var (
	allNamespaces     = ""
	allNamespacesList = []string{""}
)

// Use this ptr to bypass namespace checks in tests
var BypassNamespaceCheck = ptr.To("")

// Represents NamespaceResolver interface
type NamespaceResolver interface {
	DerefNamespace(ctx context.Context, kubeContext string, namespace *string) (string, error)
	DerefNamespaceToList(ctx context.Context, kubeContext string, namespace *string) ([]string, error)
}

// Represents DefaultNamespaceResolver struct
type DefaultNamespaceResolver struct {
	cm         ConnectionManager
	nsProvider permittedNamespacesProvider
}

// Returns new instance of namespace resolver
func NewNamespaceResolver(cm ConnectionManager, allowedNamespaces []string) NamespaceResolver {
	return &DefaultNamespaceResolver{
		cm:         cm,
		nsProvider: newPermittedNamespacesProvider(cm, allowedNamespaces),
	}
}

// Permissions-aware namespace pointer dereferencer:
//   - If namespace pointer is nil, will use default namepace for given `kubeContext`
//   - Before returning value, will cross-reference with permitted namespaces
//   - If all namespaces is requested ("") but user does not have cluster scope permission, will
//     return permission error
func (r *DefaultNamespaceResolver) DerefNamespace(ctx context.Context, kubeContext string, namespace *string) (string, error) {
	// Bypass auth
	if namespace == BypassNamespaceCheck {
		return allNamespaces, nil
	}

	// Deref
	ns := ptr.Deref(namespace, r.cm.GetDefaultNamespace(kubeContext))

	// Get permitted namespaces
	permittedNamespaces, err := r.nsProvider.GetList(ctx, kubeContext)
	if err != nil {
		return "", err
	}

	// Perform auth
	if !slices.Equal(permittedNamespaces, allNamespacesList) && !slices.Contains(permittedNamespaces, ns) {
		return "", errors.ErrForbidden
	}

	return ns, nil
}

// Permissions-aware namespace pointer dereferencer to list:
//   - If pointer is nil, will use default namepace for given `kubeContext`
//   - Before returning values, will cross-reference with permitted namespaces
//   - If all namespaces is requested ("") but user does not have cluster scope permission, will
//     return list of permitted namespaces or permission error if none
func (r *DefaultNamespaceResolver) DerefNamespaceToList(ctx context.Context, kubeContext string, namespace *string) ([]string, error) {
	// Bypass auth
	if namespace == BypassNamespaceCheck {
		return allNamespacesList, nil
	}

	// Deref
	ns := ptr.Deref(namespace, r.cm.GetDefaultNamespace(kubeContext))

	// Get permitted namespaces
	permittedNamespaces, err := r.nsProvider.GetList(ctx, kubeContext)
	if err != nil {
		return nil, err
	}

	// Completely forbidden
	if len(permittedNamespaces) == 0 {
		return nil, errors.ErrForbidden
	}

	// Handle request for all namespaces
	if ns == allNamespaces {
		return permittedNamespaces, nil
	}

	// Perform auth
	if !slices.Equal(permittedNamespaces, allNamespacesList) && !slices.Contains(permittedNamespaces, ns) {
		return nil, errors.ErrForbidden
	}

	return []string{ns}, nil
}

// Represents permittedNamespacesProvider interface
type permittedNamespacesProvider interface {
	GetList(ctx context.Context, kubeContext string) ([]string, error)
}

// Represents defaultPermittedNamespacesProvider struct
type defaultPermittedNamespacesProvider struct {
	cm                ConnectionManager
	allowedNamespaces []string
}

// Returns new instance of permitted namespaces provider
func newPermittedNamespacesProvider(cm ConnectionManager, allowedNamespaces []string) permittedNamespacesProvider {
	return &defaultPermittedNamespacesProvider{cm: cm, allowedNamespaces: allowedNamespaces}
}

// Executes request, returns list
func (p *defaultPermittedNamespacesProvider) GetList(ctx context.Context, kubeContext string) ([]string, error) {
	// Get client
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
		return allNamespacesList, nil
	}

	// Otherwise, check individual namespaces
	availableNamespaces := p.allowedNamespaces
	if len(availableNamespaces) == 0 {
		// Get all namespaces from API
		namespaceList, err := clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, err
		}

		for _, ns := range namespaceList.Items {
			availableNamespaces = append(availableNamespaces, ns.Name)
		}
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
