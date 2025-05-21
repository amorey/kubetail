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
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	authv1 "k8s.io/api/authorization/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
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

func TestDefaultNamespaceResolverDerefNamespaceSuccess(t *testing.T) {
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
			"",
		},
		{
			"any namespace permitted, input val is <nil>",
			AllNamespacesPermittedList,
			nil,
			defaultNamespace,
		},
		{
			"any namespace permitted, input val is <all>",
			AllNamespacesPermittedList,
			ptr.To(""),
			"",
		},
		{
			"any namespace permitted, input val is <arbitrary>",
			AllNamespacesPermittedList,
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
			provider := &mockPermittedNamespacesProvider{}
			provider.On("GetList", mock.Anything, setKubeContext).Return(tt.setPermittedNamespaces, nil)

			// Init resolver
			resolver := &DefaultNamespaceResolver{cm, provider}

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
			provider := &mockPermittedNamespacesProvider{}
			provider.On("GetList", mock.Anything, setKubeContext).Return(tt.setPermittedNamespaces, nil)

			// Init resolver
			resolver := &DefaultNamespaceResolver{cm, provider}

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
			[]string{""},
		},
		{
			"any namespace permitted, input val is <nil>",
			AllNamespacesPermittedList,
			nil,
			[]string{defaultNamespace},
		},
		{
			"any namespace permitted, input val is <all>",
			AllNamespacesPermittedList,
			ptr.To(""),
			[]string{""},
		},
		{
			"any namespace permitted, input val is <arbitrary>",
			AllNamespacesPermittedList,
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
			provider := &mockPermittedNamespacesProvider{}
			provider.On("GetList", mock.Anything, setKubeContext).Return(tt.setPermittedNamespaces, nil)

			// Init resolvercm, provider}
			resolver := &DefaultNamespaceResolver{cm, provider}

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
			provider := &mockPermittedNamespacesProvider{}
			provider.On("GetList", mock.Anything, setKubeContext).Return(tt.setPermittedNamespaces, nil)

			// Init resolver
			resolver := &DefaultNamespaceResolver{cm, provider}

			// Call method
			nsList, err := resolver.DerefNamespaceToList(context.Background(), setKubeContext, tt.setNamespace)
			assert.Error(t, errors.ErrForbidden, err)
			assert.Nil(t, nsList)
		})
	}
}

func TestDefaultPermittedNamespacesProviderClusterScopeAllowed(t *testing.T) {
	// Init fake clientset
	fakeClientset := &fake.Clientset{}

	// Set up fake clientset to return SelfSubjectAccessReview with status Allowed for namespace ""
	fakeClientset.AddReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		createAction := action.(k8stesting.CreateAction)
		sar := createAction.GetObject().(*authv1.SelfSubjectAccessReview)

		// Set status to Allowed
		sar.Status.Allowed = true

		return true, sar, nil
	})

	// Init mock connection manager
	cm := &k8shelpersmock.MockConnectionManager{}
	cm.On("GetOrCreateClientset", mock.Anything).Return(fakeClientset, nil)

	tests := []struct {
		name                 string
		setAllowedNamespaces []string
		wantNamespaceList    []string
	}{
		{
			"when allowed namespaces empty, returns all namespaces permitted list",
			[]string{},
			AllNamespacesPermittedList,
		},
		{
			"when allowed namespaces not empty, returns allowed namespaces list",
			[]string{"ns1", "ns2"},
			[]string{"ns1", "ns2"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Init provider
			provider := &defaultPermittedNamespacesProvider{
				cm:                cm,
				allowedNamespaces: tt.setAllowedNamespaces,
			}

			// Call method
			nsList, err := provider.GetList(context.Background(), "")
			assert.NoError(t, err)
			assert.ElementsMatch(t, tt.wantNamespaceList, nsList)
		})
	}
}

func TestDefaultPermittedNamespacesProviderClusterScopeForbidden(t *testing.T) {
	// Init fake clientset
	fakeClientset := &fake.Clientset{}

	// Set up fake clientset to return a predefined list of namespaces
	fakeClientset.AddReactor("list", "namespaces", func(action k8stesting.Action) (bool, runtime.Object, error) {
		// Create a namespace list with the namespaces you want to return
		namespaceList := &corev1.NamespaceList{
			Items: []corev1.Namespace{
				{ObjectMeta: metav1.ObjectMeta{Name: "ns1"}},
				{ObjectMeta: metav1.ObjectMeta{Name: "ns2"}},
				{ObjectMeta: metav1.ObjectMeta{Name: "ns3"}},
			},
		}

		return true, namespaceList, nil
	})

	// Set up fake clientset to return SelfSubjectAccessReview with status Forbidden for namespace ""
	fakeClientset.AddReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		createAction := action.(k8stesting.CreateAction)
		sar := createAction.GetObject().(*authv1.SelfSubjectAccessReview)

		// Set permissions
		switch sar.Spec.ResourceAttributes.Namespace {
		case "":
			sar.Status.Allowed = false
		case "ns1", "ns2":
			sar.Status.Allowed = true
		case "ns3":
			sar.Status.Allowed = false
		}

		return true, sar, nil
	})

	// Init mock connection manager
	cm := &k8shelpersmock.MockConnectionManager{}
	cm.On("GetOrCreateClientset", mock.Anything).Return(fakeClientset, nil)

	tests := []struct {
		name                 string
		setAllowedNamespaces []string
		wantNamespaceList    []string
	}{
		{
			"when allowed namespaces empty, returns all namespaces permitted",
			[]string{},
			[]string{"ns1", "ns2"},
		},
		{
			"when allowed namespaces not empty, returns intersection of lists",
			[]string{"ns1"},
			[]string{"ns1"},
		},
		{
			"when no intersection, returns empty list",
			[]string{"ns3"},
			[]string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Init provider
			provider := &defaultPermittedNamespacesProvider{
				cm:                cm,
				allowedNamespaces: tt.setAllowedNamespaces,
			}

			// Call method
			nsList, err := provider.GetList(context.Background(), "")
			assert.Nil(t, err)
			assert.ElementsMatch(t, tt.wantNamespaceList, nsList)
		})
	}
}

func TestDefaultPermittedNamespacesProviderErrorHandling(t *testing.T) {
	t.Run("err from cluster scope ssar", func(t *testing.T) {
		setErr := fmt.Errorf("mock error")

		// Init fake clientset
		fakeClientset := &fake.Clientset{}

		// Set up fake clientset to return error from cluster scope ssar
		fakeClientset.AddReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
			return true, nil, setErr
		})

		// Init mock connection manager
		cm := &k8shelpersmock.MockConnectionManager{}
		cm.On("GetOrCreateClientset", mock.Anything).Return(fakeClientset, nil)

		// Init provider
		provider := &defaultPermittedNamespacesProvider{
			cm:                cm,
			allowedNamespaces: []string{},
		}

		// Call method
		nsList, err := provider.GetList(context.Background(), "")
		assert.Error(t, setErr, err)
		assert.Nil(t, nsList)
	})

	t.Run("err from list namespaces", func(t *testing.T) {
		setErr := fmt.Errorf("mock error")

		// Init fake clientset
		fakeClientset := &fake.Clientset{}

		// Set up fake clientset to return error from list namespaces
		fakeClientset.AddReactor("list", "namespaces", func(action k8stesting.Action) (bool, runtime.Object, error) {
			return true, nil, setErr
		})

		// Init mock connection manager
		cm := &k8shelpersmock.MockConnectionManager{}
		cm.On("GetOrCreateClientset", mock.Anything).Return(fakeClientset, nil)

		// Init provider
		provider := &defaultPermittedNamespacesProvider{
			cm:                cm,
			allowedNamespaces: []string{},
		}

		// Call method
		nsList, err := provider.GetList(context.Background(), "")
		assert.Error(t, setErr, err)
		assert.Nil(t, nsList)
	})

	t.Run("err from individual ssar", func(t *testing.T) {
		setErr := fmt.Errorf("mock error")

		// Init fake clientset
		fakeClientset := &fake.Clientset{}

		// Set up fake clientset to return a predefined list of namespaces
		fakeClientset.AddReactor("list", "namespaces", func(action k8stesting.Action) (bool, runtime.Object, error) {
			// Create a namespace list with the namespaces you want to return
			namespaceList := &corev1.NamespaceList{
				Items: []corev1.Namespace{
					{ObjectMeta: metav1.ObjectMeta{Name: "ns1"}},
					{ObjectMeta: metav1.ObjectMeta{Name: "ns2"}},
					{ObjectMeta: metav1.ObjectMeta{Name: "ns3"}},
				},
			}

			return true, namespaceList, nil
		})

		// Set up fake clientset to return SelfSubjectAccessReview with status Forbidden for namespace ""
		fakeClientset.AddReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
			createAction := action.(k8stesting.CreateAction)
			sar := createAction.GetObject().(*authv1.SelfSubjectAccessReview)

			// Set permissions
			switch sar.Spec.ResourceAttributes.Namespace {
			case "":
				sar.Status.Allowed = false
			case "ns1", "ns2":
				sar.Status.Allowed = true
			case "ns3":
				// Return error
				return true, nil, setErr
			}

			return true, sar, nil
		})

		// Init mock connection manager
		cm := &k8shelpersmock.MockConnectionManager{}
		cm.On("GetOrCreateClientset", mock.Anything).Return(fakeClientset, nil)

		// Init provider
		provider := &defaultPermittedNamespacesProvider{
			cm:                cm,
			allowedNamespaces: []string{},
		}

		// Call method
		nsList, err := provider.GetList(context.Background(), "")
		assert.Error(t, setErr, err)
		assert.Nil(t, nsList)
	})
}
