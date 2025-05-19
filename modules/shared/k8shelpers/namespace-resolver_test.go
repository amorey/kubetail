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
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"k8s.io/utils/ptr"

	"github.com/kubetail-org/kubetail/modules/shared/graphql/errors"
	k8shelpersmock "github.com/kubetail-org/kubetail/modules/shared/k8shelpers/mock"
)

// Mock permittedNamespacesProvider
type mockPermittedNamespacesProvider struct {
	mock.Mock
}

func (m *mockPermittedNamespacesProvider) GetList(ctx context.Context, kubeContext string) ([]string, error) {
	ret := m.Called(ctx, kubeContext)
	return ret.Get(0).([]string), ret.Error(1)
}

func TestNamespaceResolverDerefNamespaceSuccess(t *testing.T) {
	const setKubeContext = "kubeContext1"
	const defaultNamespace = "default1"

	// Init mock connection manager
	cm := &k8shelpersmock.MockConnectionManager{}
	cm.On("GetDefaultNamespace", setKubeContext).Return(defaultNamespace)

	tests := []struct {
		name                   string
		setPermittedNamespaces []string
		setNamespace           *string
		wantNamespace          string
	}{
		{
			"BypassNamespaceCheck",
			[]string{"ns1", "ns2"},
			BypassNamespaceCheck,
			AllNamespaces,
		},
		{
			"any namespace permitted, input val is <nil>",
			AllNamespacesList,
			nil,
			defaultNamespace,
		},
		{
			"any namespace permitted, input val is <all>",
			AllNamespacesList,
			ptr.To(""),
			AllNamespaces,
		},
		{
			"any namespace permitted, input val is <arbitrary>",
			AllNamespacesList,
			ptr.To("ns"),
			"ns",
		},
		{
			"single namespace permitted, input val is <valid>",
			[]string{"ns"},
			ptr.To("ns"),
			"ns",
		},
		{
			"multiple namespaces permitted, input val is <valid>",
			[]string{"ns1", "ns2"},
			ptr.To("ns1"),
			"ns1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Init mock permitted namespaces provider
			nsProvider := &mockPermittedNamespacesProvider{}
			nsProvider.On("GetList", mock.Anything, setKubeContext).Return(tt.setPermittedNamespaces, nil)

			// Init resolver
			resolver := &DefaultNamespaceResolver{
				cm:         cm,
				nsProvider: nsProvider,
			}

			// Call method
			ns, err := resolver.DerefNamespace(context.Background(), setKubeContext, tt.setNamespace)
			assert.NoError(t, err)
			assert.Equal(t, tt.wantNamespace, ns)

			// Verify call to mock
			if tt.setNamespace != BypassNamespaceCheck {
				cm.AssertCalled(t, "GetDefaultNamespace", setKubeContext)
			}
		})
	}
}

func TestNamespaceResolverDerefNamespaceForbidden(t *testing.T) {
	const setKubeContext = "kubeContext1"
	const defaultNamespace = "default1"

	// Init mock connection manager
	cm := &k8shelpersmock.MockConnectionManager{}
	cm.On("GetDefaultNamespace", setKubeContext).Return(defaultNamespace)

	tests := []struct {
		name                   string
		setPermittedNamespaces []string
		setNamespace           *string
	}{
		{
			"no namespaces permitted",
			[]string{},
			nil,
		},
		{
			"single namespace permitted, input val is <empty>",
			[]string{"ns1"},
			nil,
		},
		{
			"single namespace permitted, input val is <all>",
			[]string{"ns1"},
			ptr.To(""),
		},
		{
			"single namespace permitted, input val is <not-valid>",
			[]string{"ns1"},
			ptr.To("ns2"),
		},
		{
			"multiple namespaces permitted, input val is <empty>",
			[]string{"ns1", "ns2"},
			nil,
		},
		{
			"multiple namespaces permitted, input val is <all>",
			[]string{"ns1", "ns2"},
			ptr.To(""),
		},
		{
			"multiple namespaces permitted, input val is <not-valid>",
			[]string{"ns1", "ns2"},
			ptr.To("ns3"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Init mock permitted namespaces provider
			nsProvider := &mockPermittedNamespacesProvider{}
			nsProvider.On("GetList", mock.Anything, setKubeContext).Return(tt.setPermittedNamespaces, nil)

			// Init resolver
			resolver := &DefaultNamespaceResolver{
				cm:         cm,
				nsProvider: nsProvider,
			}

			// Call method
			ns, err := resolver.DerefNamespace(context.Background(), setKubeContext, tt.setNamespace)
			assert.Error(t, errors.ErrForbidden, err)
			assert.Equal(t, "", ns)
		})
	}
}

func TestNamespaceResolverDerefNamespaceToListSuccess(t *testing.T) {
	const setKubeContext = "kubeContext1"
	const defaultNamespace = "default1"

	// Init mock connection manager
	cm := &k8shelpersmock.MockConnectionManager{}
	cm.On("GetDefaultNamespace", setKubeContext).Return(defaultNamespace)

	tests := []struct {
		name                   string
		setPermittedNamespaces []string
		setNamespace           *string
		wantNamespaceList      []string
	}{
		{
			"BypassNamespaceCheck",
			[]string{"ns1", "ns2"},
			BypassNamespaceCheck,
			AllNamespacesList,
		},
		{
			"any namespace permitted, input val is <nil>",
			AllNamespacesList,
			nil,
			[]string{defaultNamespace},
		},
		{
			"any namespace permitted, input val is <all>",
			AllNamespacesList,
			ptr.To(""),
			AllNamespacesList,
		},
		{
			"any namespace permitted, input val is <arbitrary>",
			AllNamespacesList,
			ptr.To("ns"),
			[]string{"ns"},
		},
		{
			"single namespace permitted, input val is <valid>",
			[]string{"ns"},
			ptr.To("ns"),
			[]string{"ns"},
		},
		{
			"single namespace permitted, input val is <all>",
			[]string{"ns"},
			ptr.To(""),
			[]string{"ns"},
		},
		{
			"multiple namespaces permitted, input val is <valid>",
			[]string{"ns1", "ns2"},
			ptr.To("ns1"),
			[]string{"ns1"},
		},
		{
			"multiple namespaces permitted, input val is <all>",
			[]string{"ns1", "ns2"},
			ptr.To(""),
			[]string{"ns1", "ns2"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Init mock permitted namespace provider
			nsProvider := &mockPermittedNamespacesProvider{}
			nsProvider.On("GetList", mock.Anything, setKubeContext).Return(tt.setPermittedNamespaces, nil)

			// Init resolver
			resolver := &DefaultNamespaceResolver{
				cm:         cm,
				nsProvider: nsProvider,
			}

			// Call method
			nsList, err := resolver.DerefNamespaceToList(context.Background(), setKubeContext, tt.setNamespace)
			assert.NoError(t, err)
			assert.Equal(t, tt.wantNamespaceList, nsList)

			// Verify call to mock
			if tt.setNamespace != BypassNamespaceCheck {
				cm.AssertCalled(t, "GetDefaultNamespace", setKubeContext)
			}
		})
	}
}

func TestNamespaceResolverDerefNamespaceToListForbidden(t *testing.T) {
	const setKubeContext = "kubeContext1"
	const defaultNamespace = "default1"

	// Init mock connection manager
	cm := &k8shelpersmock.MockConnectionManager{}
	cm.On("GetDefaultNamespace", setKubeContext).Return(defaultNamespace)

	tests := []struct {
		name                   string
		setPermittedNamespaces []string
		setNamespace           *string
	}{
		{
			"no namespaces permitted",
			[]string{},
			nil,
		},
		{
			"single namespace permitted, input val is <empty>",
			[]string{"ns"},
			nil,
		},
		{
			"single namespace permitted, input val is <not-valid>",
			[]string{"ns"},
			ptr.To("ns2"),
		},
		{
			"multiple namespaces permitted, input val is <empty>",
			[]string{"ns1", "ns2"},
			nil,
		},
		{
			"multiple namespace permitted, input val is <not-valid>",
			[]string{"ns1", "ns2"},
			ptr.To("ns3"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Init mock permitted namespace provider
			nsProvider := &mockPermittedNamespacesProvider{}
			nsProvider.On("GetList", mock.Anything, setKubeContext).Return(tt.setPermittedNamespaces, nil)

			// Init resolver
			resolver := &DefaultNamespaceResolver{
				cm:         cm,
				nsProvider: nsProvider,
			}

			// Call method
			nsList, err := resolver.DerefNamespaceToList(context.Background(), setKubeContext, tt.setNamespace)
			assert.Error(t, errors.ErrForbidden, err)
			assert.Nil(t, nsList)
		})
	}
}
