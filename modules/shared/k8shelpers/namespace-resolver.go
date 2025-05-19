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

	"golang.org/x/sync/errgroup"
	authv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// Represents NamespaceResolver interface
type NamespaceResolver interface {
	DerefNamespace(ctx context.Context, kubeContext string, namespace *string) (string, error)
	DerefNamespaceToList(ctx context.Context, kubeContext string, namespace *string) ([]string, error)
	GetPermittedNamespaces(ctx context.Context, kubeContext string) ([]string, error)
}

// Represents DefaultNamespaceResolver struct
type DefaultNamespaceResolver struct {
	cm ConnectionManager
	allowedNamespaces []string
}

// Returns new instance of namespace resolver
func NewNamespaceResolver(cm ConnectionManager, allowedNamespaces []string) NamespaceResolver {
	return &DefaultNamespaceResolver{cm: cm, allowedNamespaces: allowedNamespaces}
}

// Dereference namespace pointer to single permitted namespace (nil is treated as default namespace)
func (r *DefaultNamespaceResolver) DerefNamespace(ctx context.Context, kubeContext string, namespace *string) (string, error) {
	ns := DerefNamespace(namespace, r.cm.)
}

// Dereference namespace pointer to list of permitted namespaces (nil is treated as default namespace)
func (r *DefaultNamespaceResolver) DerefNamespaceToList(ctx context.Context, kubeContext string, namespace *string) ([]string, error) {
	panic("not implemented")
}

// Returns list of permitted namespaces
func (r *DefaultNamespaceResolver) GetPermittedNamespaces(ctx context.Context, kubeContext string) ([]string, error) {
	// Get bearer token (if any)
	//token, ok := ctx.Value(K8STokenCtxKey).(string)
	//if !ok {
	//	token = ""
	//}

	// Get client
	clientset, err := r.cm.GetOrCreateClientset(kubeContext)
	if err != nil {
		return nil, err
	}

	// Check if user has access to cluster scope
	clusterScopeAllowed, err := r.doSAR(ctx, clientset, "")
	if err != nil {
		return nil, err
	}

	// If user has access to cluster scope, return allowed namespaces
	if clusterScopeAllowed {
		if len(allowedNamespaces) != 0 {
			return allowedNamespaces, nil
		}
		return []string{""}, nil
	}

	// Otherwise, check individual namespaces
	availableNamespaces := allowedNamespaces
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
			allowed, err := r.doSAR(ctx, clientset, namespace)
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
func (r *DefaultNamespaceResolver) doSAR(ctx context.Context, clientset kubernetes.Interface, namespace string) (bool, error) {
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
