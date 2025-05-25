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

package mock

import (
	"context"

	"github.com/stretchr/testify/mock"
)

// Represents mock for namespace resolver
type MockNamespaceResolver struct {
	mock.Mock
}

func (m *MockNamespaceResolver) DerefNamespace(ctx context.Context, kubeContext string, namespace *string) (string, error) {
	ret := m.Called(ctx, kubeContext, namespace)
	return ret.String(0), ret.Error(1)
}

func (m *MockNamespaceResolver) DerefNamespaceToList(ctx context.Context, kubeContext string, namespace *string) ([]string, error) {
	ret := m.Called(ctx, kubeContext, namespace)

	var r0 []string
	if ret.Get(0) != nil {
		r0 = ret.Get(0).([]string)
	}

	return r0, ret.Error(1)
}

func (m *MockNamespaceResolver) GetPermittedNamespaces(ctx context.Context, kubeContext string) ([]string, error) {
	ret := m.Called(ctx, kubeContext)
	return ret.Get(0).([]string), ret.Error(1)
}
