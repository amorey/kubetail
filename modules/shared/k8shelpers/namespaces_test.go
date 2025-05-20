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
	"testing"

	"github.com/stretchr/testify/assert"
	"k8s.io/utils/ptr"

	"github.com/kubetail-org/kubetail/modules/shared/graphql/errors"
)

func TestDerefNamespaceSuccess(t *testing.T) {
	const defaultNamespace = "default"

	tests := []struct {
		name                 string
		setAllowedNamespaces []string
		setNamespace         *string
		wantNamespace        string
	}{
		{
			"BypassNamespaceCheck",
			[]string{"testns1", "testns2"},
			BypassNamespaceCheck,
			"",
		},
		{
			"any namespace allowed, input val is <nil>",
			[]string{},
			nil,
			defaultNamespace,
		},
		{
			"any namespace allowed, input val is <all>",
			[]string{},
			ptr.To(""),
			"",
		},
		{
			"any namespace allowed, input val is <arbitrary>",
			[]string{},
			ptr.To("ns1"),
			"ns1",
		},
		{
			"single namespace allowed, input val is in list",
			[]string{"ns"},
			ptr.To("ns"),
			"ns",
		},
		{
			"multiple namespaces allowed, input val is in list",
			[]string{"ns1", "ns2"},
			ptr.To("ns2"),
			"ns2",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actualNamespace, err := DerefNamespace(tt.setAllowedNamespaces, tt.setNamespace, defaultNamespace)
			assert.Nil(t, err)
			assert.Equal(t, tt.wantNamespace, actualNamespace)
		})
	}
}

func TestDerefNamespaceForbidden(t *testing.T) {
	tests := []struct {
		name                 string
		setAllowedNamespaces []string
		setNamespace         *string
	}{
		{
			"single namespace allowed, input val is <empty>",
			[]string{"ns1"},
			nil,
		},
		{
			"single namespace allowed, input val is <all>",
			[]string{"ns1"},
			ptr.To(""),
		},
		{
			"single namespace allowed, input val is not in list",
			[]string{"ns1"},
			ptr.To("ns2"),
		},
		{
			"multiple namespaces allowed, input val is <empty>",
			[]string{"ns1", "ns2"},
			nil,
		},
		{
			"multiple namespaces allowed, input val is <all>",
			[]string{"ns1", "ns2"},
			ptr.To(""),
		},
		{
			"multiple namespaces allowed, input val is not in list",
			[]string{"ns1", "ns2"},
			ptr.To("ns3"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ns, err := DerefNamespace(tt.setAllowedNamespaces, tt.setNamespace, "default")
			assert.Error(t, errors.ErrForbidden, err)
			assert.Equal(t, "", ns)
		})
	}
}

func TestDerefNamespaceToListSuccess(t *testing.T) {
	const defaultNamespace = "default"

	tests := []struct {
		name                 string
		setAllowedNamespaces []string
		setNamespace         *string
		wantNamespaces       []string
	}{
		{
			"BypassNamespaceCheck",
			[]string{"testns1", "testns2"},
			BypassNamespaceCheck,
			[]string{""},
		},
		{
			"any namespace allowed, input val is <nil>",
			[]string{},
			nil,
			[]string{defaultNamespace},
		},
		{
			"any namespace allowed, input val is <all>",
			[]string{},
			ptr.To(""),
			[]string{""},
		},
		{
			"any namespace allowed, input val is <arbitrary>",
			[]string{},
			ptr.To("ns"),
			[]string{"ns"},
		},
		{
			"single namespace allowed, input val is in list",
			[]string{"ns"},
			ptr.To("ns"),
			[]string{"ns"},
		},
		{
			"single namespace allowed, input val is <all>",
			[]string{"ns"},
			ptr.To(""),
			[]string{"ns"},
		},
		{
			"multiple namespaces allowed, input val is in list",
			[]string{"ns1", "ns2"},
			ptr.To("ns2"),
			[]string{"ns2"},
		},
		{
			"multiple namespaces allowed, input val is <all>",
			[]string{"ns1", "ns2"},
			ptr.To(""),
			[]string{"ns1", "ns2"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actualNamespaces, err := DerefNamespaceToList(tt.setAllowedNamespaces, tt.setNamespace, defaultNamespace)
			assert.Nil(t, err)
			assert.Equal(t, tt.wantNamespaces, actualNamespaces)
		})
	}
}

func TestDerefNamespacesToListForbidden(t *testing.T) {
	tests := []struct {
		name                 string
		setAllowedNamespaces []string
		setNamespace         *string
	}{
		{
			"single namespace allowed, input val is <empty>",
			[]string{"ns"},
			nil,
		},
		{
			"single namespace allowed, input val is not in list",
			[]string{"ns"},
			ptr.To("not-ns"),
		},
		{
			"multiple namespaces allowed, input val is <empty>",
			[]string{"ns1", "ns2"},
			nil,
		},
		{
			"multiple namespaces allowed, input val is not in list",
			[]string{"ns1", "ns2"},
			ptr.To("ns3"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actualNamespaces, err := DerefNamespaceToList(tt.setAllowedNamespaces, tt.setNamespace, "default")
			assert.Error(t, errors.ErrForbidden, err)
			assert.Equal(t, []string(nil), actualNamespaces)
		})
	}
}
