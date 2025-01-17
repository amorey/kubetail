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

package clusterapi

import (
	"context"
	"fmt"
	"sync"

	"github.com/kubetail-org/kubetail/modules/dashboard/internal/k8shelpers"
	"k8s.io/utils/ptr"
)

// Represents HealthMonitorManager
type HealthMonitorManager struct {
	cm           k8shelpers.ConnectionManager
	monitorCache map[string]*HealthMonitor
	mu           sync.Mutex
}

// Create new HealthMonitorManager instance
func NewHealthMonitorManager(cm k8shelpers.ConnectionManager) *HealthMonitorManager {
	return &HealthMonitorManager{
		cm:           cm,
		monitorCache: make(map[string]*HealthMonitor),
	}
}

// Shutdown all managed monitors
func (hmm *HealthMonitorManager) Shutdown() {
	var wg sync.WaitGroup
	for _, monitor := range hmm.monitorCache {
		wg.Add(1)
		go func() {
			defer wg.Done()
			monitor.Shutdown()
		}()
	}
	wg.Wait()
}

// GetOrCreateMonitor
func (hmm *HealthMonitorManager) GetOrCreateMonitor(ctx context.Context, kubeContextPtr *string, namespacePtr *string, serviceNamePtr *string) (*HealthMonitor, error) {
	hmm.mu.Lock()
	defer hmm.mu.Unlock()

	kubeContext := hmm.cm.DerefKubeContext(kubeContextPtr)
	namespace := ptr.Deref(namespacePtr, DefaultNamespace)
	serviceName := ptr.Deref(serviceNamePtr, DefaultServiceName)

	// Constuct cache key
	k := fmt.Sprintf("%s::%s::%s", kubeContext, namespace, serviceName)

	// Check cache
	monitor, exists := hmm.monitorCache[k]
	if !exists {
		// Get clientset
		clientset, err := hmm.cm.GetOrCreateClientset(ptr.To(kubeContext))
		if err != nil {
			return nil, err
		}

		// Initialize health monitor
		monitor, err = NewHealthMonitor(ctx, clientset, namespace, serviceName)
		if err != nil {
			return nil, err
		}

		// Add to cache
		hmm.monitorCache[k] = monitor

		// Start background processes and wait for cache to sync
		err = monitor.Start(ctx)
		if err != nil {
			return nil, err
		}
	}

	return monitor, nil
}
