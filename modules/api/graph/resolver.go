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

package graph

import (
	"slices"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	grpcdispatcher "github.com/kubetail-org/grpc-dispatcher-go"

	"github.com/kubetail-org/kubetail/modules/common/graph/errors"
)

// This file will not be regenerated automatically.
//
// It serves as dependency injection for your app, add any dependencies you require here.

//go:generate go run github.com/99designs/gqlgen generate

type Resolver struct {
	grpcDispatcher    *grpcdispatcher.Dispatcher
	allowedNamespaces []string
}

func (r *Resolver) ToNamespace(namespace *string) (string, error) {
	ns := metav1.NamespaceDefault
	if namespace != nil {
		ns = *namespace
	}

	// perform auth
	if len(r.allowedNamespaces) > 0 && !slices.Contains(r.allowedNamespaces, ns) {
		return "", errors.ErrForbidden
	}

	return ns, nil
}

func (r *Resolver) ToNamespaces(namespace *string) ([]string, error) {
	var namespaces []string

	ns := metav1.NamespaceDefault
	if namespace != nil {
		ns = *namespace
	}

	// perform auth
	if ns != "" && len(r.allowedNamespaces) > 0 && !slices.Contains(r.allowedNamespaces, ns) {
		return nil, errors.ErrForbidden
	}

	// listify
	if ns == "" && len(r.allowedNamespaces) > 0 {
		namespaces = r.allowedNamespaces
	} else {
		namespaces = []string{ns}
	}

	return namespaces, nil
}

// Create new Resolver instance
func NewResolver(dispatcher *grpcdispatcher.Dispatcher, allowedNamespaces []string) (*Resolver, error) {
	return &Resolver{
		grpcDispatcher:    dispatcher,
		allowedNamespaces: allowedNamespaces,
	}, nil
}
