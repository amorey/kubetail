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

package ginapp

import (
	"context"
	"fmt"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
	zlog "github.com/rs/zerolog/log"
	authv1 "k8s.io/api/authentication/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/kubectl/pkg/proxy"
	"k8s.io/utils/ptr"

	"github.com/kubetail-org/kubetail/modules/shared/config"
)

func newKubetailAPIProxyHandler(cfg *config.Config, prefix string, k8scfg *rest.Config) gin.HandlerFunc {
	// Handle test-mode
	if k8scfg == nil {
		return func(c *gin.Context) {
			panic("not implemented")
		}
	}

	var token string

	if cfg.AuthMode == config.AuthModeLocal {
		// Create a clientset
		clientset, err := kubernetes.NewForConfig(k8scfg)
		if err != nil {
			panic(err)
		}

		// Define the namespace and service account
		namespace := "kubetail-system"
		serviceAccountName := "kubetail-cli"

		// Prepare the TokenRequest object
		tokenRequest := &authv1.TokenRequest{
			Spec: authv1.TokenRequestSpec{
				ExpirationSeconds: ptr.To[int64](3600), // Token validity (e.g., 1 hour)
				Audiences: []string{
					"https://kubernetes.default.svc.cluster.local",
					"http://kubetail-api.kubetail-system.svc.cluster.local",
				},
			},
		}

		// Request a token for the ServiceAccount
		t, err := clientset.CoreV1().ServiceAccounts(namespace).CreateToken(context.TODO(), serviceAccountName, tokenRequest, metav1.CreateOptions{})
		if err != nil {
			panic(err)
		}
		token = t.Status.Token
	}

	h, err := proxy.NewProxyHandler("/", nil, k8scfg, 0, false)
	if err != nil {
		zlog.Fatal().Err(err).Send()
	}

	return func(c *gin.Context) {
		relPath := strings.TrimPrefix(c.Request.URL.Path, prefix)
		urlCopy := *c.Request.URL
		urlCopy.Path = path.Join("/api/v1/namespaces/kubetail-system/services/kubetail-api:http/proxy", relPath)
		c.Request.URL = &urlCopy

		if token != "" {
			c.Request.Header.Add("X-Forwarded-Authorization", fmt.Sprintf("Bearer %s", token))
		}

		h.ServeHTTP(c.Writer, c.Request)
	}
}
