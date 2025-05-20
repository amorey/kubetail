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

	"k8s.io/utils/ptr"

	"github.com/kubetail-org/kubetail/modules/shared/config"
	"github.com/kubetail-org/kubetail/modules/shared/graphql/errors"
)

// Use this ptr to bypass namespace checks
var BypassNamespaceCheck = ptr.To("")

// Dereference `namespace` argument and check that it is allowed
func DerefNamespace(allowedNamespaces []string, namespace *string, defaultNamespace string) (string, error) {
	ns := ptr.Deref(namespace, defaultNamespace)

	// bypass auth
	if namespace == BypassNamespaceCheck {
		return ns, nil
	}

	// perform auth
	if len(allowedNamespaces) > 0 && !slices.Contains(allowedNamespaces, ns) {
		return "", errors.ErrForbidden
	}

	return ns, nil
}

// Dereference `namespace` argument, check if it's allowed, if equal to "" then return allowedNamespaes
func DerefNamespaceToList(allowedNamespaces []string, namespace *string, defaultNamespace string) ([]string, error) {
	ns := ptr.Deref(namespace, defaultNamespace)

	// bypass auth
	if namespace == BypassNamespaceCheck {
		return []string{""}, nil
	}

	// perform auth
	if ns != "" && len(allowedNamespaces) > 0 && !slices.Contains(allowedNamespaces, ns) {
		return nil, errors.ErrForbidden
	}

	// listify
	if ns == "" && len(allowedNamespaces) > 0 {
		return allowedNamespaces, nil
	}

	return []string{ns}, nil
}

// Represents PermittedNamespacesProvider interface
type PermittedNamespacesProvider interface {
	List(ctx context.Context, kubeContext string) ([]string, error)
}

// Represents DesktopPermittedNamespacesProvider
type DesktopPermittedNamespacesProvider struct {
	cm ConnectionManager
}

// Initalize new DesktopPermittedNamespacesProvider
func NewDesktopPermittedNamespacesProvider(cm ConnectionManager, options ...PermittedNamespacesProviderOption) *DesktopPermittedNamespacesProvider {
	pnp := &DesktopPermittedNamespacesProvider{cm}

	// Apply options
	for _, option := range options {
		option(pnp)
	}

	return pnp
}

// Returns list of permitted namespaces
func (p *DesktopPermittedNamespacesProvider) List(ctx context.Context, kubeContext string) ([]string, error) {
	panic("not implemented")
}

// Represents InClusterPermittedNamespacesProvider
type InClusterPermittedNamespacesProvider struct {
	cm                ConnectionManager
	allowedNamespaces []string
}

// Returns list of permitted namespaces
func (p *InClusterPermittedNamespacesProvider) List(ctx context.Context, kubeContext string) ([]string, error) {
	panic("not implemented")
}

// Initalize new InClusterPermittedNamespacesProvider
func NewInClusterPermittedNamespacesProvider(cm ConnectionManager, options ...PermittedNamespacesProviderOption) *InClusterPermittedNamespacesProvider {
	pnp := &InClusterPermittedNamespacesProvider{cm: cm}

	// Apply options
	for _, option := range options {
		option(pnp)
	}

	return pnp
}

// Returns new PermittedNamespacesProvider instance
func NewPermittedNamespacesProvider(env config.Environment, cm ConnectionManager, options ...PermittedNamespacesProviderOption) PermittedNamespacesProvider {
	switch env {
	case config.EnvironmentDesktop:
		return NewDesktopPermittedNamespacesProvider(cm, options...)
	case config.EnvironmentCluster:
		return NewInClusterPermittedNamespacesProvider(cm, options...)
	default:
		panic("not supported")
	}
}

// Represents variadic option for PermittedNamespacesProvider
type PermittedNamespacesProviderOption func(pnp PermittedNamespacesProvider)

// WithAllowedNamespaces places top-level restrictions on namespaces (cluster-only)
func WithAllowedNamespaces(allowedNamespaces []string) PermittedNamespacesProviderOption {
	return func(pnp PermittedNamespacesProvider) {
		switch t := pnp.(type) {
		case *InClusterPermittedNamespacesProvider:
			t.allowedNamespaces = allowedNamespaces
		}
	}
}
