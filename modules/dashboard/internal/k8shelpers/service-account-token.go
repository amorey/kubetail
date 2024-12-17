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
	"context"
	"fmt"
	"sync"
	"time"

	zlog "github.com/rs/zerolog/log"
	authv1 "k8s.io/api/authentication/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/utils/ptr"
)

type ServiceAccountToken struct {
	mu                 sync.RWMutex
	namespace          string
	name               string
	clientset          kubernetes.Interface
	latestTokenRequest *authv1.TokenRequest
	shutdownCh         chan struct{}
}

func (sat *ServiceAccountToken) Token() string {
	sat.mu.RLock()
	defer sat.mu.RUnlock()

	if sat.latestTokenRequest == nil {
		// wait for writer
		sat.mu.Lock()
		defer sat.mu.Unlock()
		return ""
	}

	return sat.latestTokenRequest.Status.Token
}

// Refresh the token
func (sat *ServiceAccountToken) refreshToken(ctx context.Context) error {
	sat.mu.Lock()
	defer sat.mu.Unlock()

	// Prepare the TokenRequest object
	tokenRequest := &authv1.TokenRequest{
		Spec: authv1.TokenRequestSpec{
			ExpirationSeconds: ptr.To[int64](3600), // Token validity (e.g., 1 hour)
			Audiences: []string{
				"https://kubernetes.default.svc.cluster.local",
				fmt.Sprintf("http://kubetail-api.%s.svc.cluster.local", sat.namespace),
			},
		},
	}

	// Request a token for the ServiceAccount
	if tmp, err := sat.clientset.CoreV1().ServiceAccounts(sat.namespace).CreateToken(ctx, sat.name, tokenRequest, metav1.CreateOptions{}); err != nil {
		return err
	} else {
		sat.latestTokenRequest = tmp
	}

	return nil
}

// Start background refresh process
func (sat *ServiceAccountToken) startBackgroundRefresh() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Refresh loop
	go func() {
	Loop:
		for {
			// Refresh token
			if err := sat.refreshToken(ctx); err != nil {
				zlog.Error().Err(err).Send()
			}

			// Exit if context was canceled
			if ctx.Err() != nil {
				break Loop
			}

			// Calculate sleep time
			sleepTime := time.Duration(30 * time.Second)
			if sat.latestTokenRequest != nil {
				sat.mu.RLock()
				t := time.Until(sat.latestTokenRequest.Status.ExpirationTimestamp.Time) / 2
				if t > 30*time.Second {
					sleepTime = t
				}
				sat.mu.RUnlock()
			}

			// Wait with context awareness
			select {
			case <-time.After(sleepTime):
				// Continue after sleep
			case <-ctx.Done():
				// Exit loop if context is canceled
				break Loop
			}
		}
	}()

	// Wait for shutdown signal
	<-sat.shutdownCh
}

func NewServiceAccountToken(namespace string, name string, cfg *rest.Config, shutdownCh chan struct{}) (*ServiceAccountToken, error) {
	clientset, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, err
	}

	sat := &ServiceAccountToken{
		namespace:  namespace,
		name:       name,
		clientset:  clientset,
		shutdownCh: shutdownCh,
	}

	go sat.startBackgroundRefresh()

	return sat, nil
}
