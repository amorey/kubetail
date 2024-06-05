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

package grpchelpers

import (
	"sync"

	"golang.org/x/exp/maps"
	"google.golang.org/grpc"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

type GrpcConnectionManagerInterface interface {
}

type GrpcConnectionManager struct {
	mu           sync.Mutex
	k8sClientset kubernetes.Interface
	conns        map[string]*grpc.ClientConn
}

func (cm *GrpcConnectionManager) Get(nodeName string) *grpc.ClientConn {
	return cm.conns[nodeName]
}

func (cm *GrpcConnectionManager) GetAll() []*grpc.ClientConn {
	return maps.Values(cm.conns)
}

func (cm *GrpcConnectionManager) Teardown() {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	for _, conn := range cm.conns {
		conn.Close()
	}
}

func NewGrpcConnectionManager() (*GrpcConnectionManager, error) {
	cfg, err := rest.InClusterConfig()
	if err != nil {
		return nil, err
	}

	clientset, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}

	return &GrpcConnectionManager{k8sClientset: clientset}, nil
}
