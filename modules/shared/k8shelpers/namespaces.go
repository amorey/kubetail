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
	"slices"

	"k8s.io/utils/ptr"

	"github.com/kubetail-org/kubetail/modules/shared/graphql/errors"
)

// Use this ptr to bypass namespace checks
var BypassNamespaceCheck = ptr.To("")

// Namespace pointer dereferencer:
//   - If namespace pointer is nil, will use given default namepace
//   - Before returning value, will cross-reference with allowedNamespaces
//   - If all namespaces is requested ("") but allowedNamespaces is restricted, will return forbidden error
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

// Namespace pointer dereferencer to list:
//   - If pointer is nil, will use given default namepace
//   - Before returning values, will cross-reference with allowedNamespaces
//   - If all namespaces is requested ("") but allowedNamespaces is restricted will return allowedNamespaces
func DerefNamespaceToList(allowedNamespaces []string, namespace *string, defaultNamespace string) ([]string, error) {
	ns := ptr.Deref(namespace, defaultNamespace)

	// Bypass auth
	if namespace == BypassNamespaceCheck {
		return []string{""}, nil
	}

	// If any namespace allowed, listify input and return
	if len(allowedNamespaces) == 0 {
		return []string{ns}, nil
	}

	// If user requests all namespaces, return explicit list of permitted namespaces
	if ns == "" {
		return allowedNamespaces, nil
	}

	// If namespace is forbidden, return error
	if !slices.Contains(allowedNamespaces, ns) {
		return nil, errors.ErrForbidden
	}

	// Listify
	return []string{ns}, nil
}
