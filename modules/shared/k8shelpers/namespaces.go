// Copyright 2024 Andres Morey
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

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/kubetail-org/kubetail/modules/shared/graphql/errors"
)

func ToNamespace(allowedNamespaces []string, namespace *string) (string, error) {
	ns := metav1.NamespaceDefault
	if namespace != nil {
		ns = *namespace
	}

	// perform auth
	if len(allowedNamespaces) > 0 && !slices.Contains(allowedNamespaces, ns) {
		return "", errors.ErrForbidden
	}

	return ns, nil
}

func ToNamespaces(allowedNamespaces []string, namespace *string) ([]string, error) {
	var namespaces []string

	ns := metav1.NamespaceDefault
	if namespace != nil {
		ns = *namespace
	}

	// perform auth
	if ns != "" && len(allowedNamespaces) > 0 && !slices.Contains(allowedNamespaces, ns) {
		return nil, errors.ErrForbidden
	}

	// listify
	if ns == "" && len(allowedNamespaces) > 0 {
		namespaces = allowedNamespaces
	} else {
		namespaces = []string{ns}
	}

	return namespaces, nil
}