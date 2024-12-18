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
	"fmt"
	"net/http"
	"net/http/httptest"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
	"k8s.io/client-go/rest"
	"k8s.io/kubectl/pkg/proxy"

	"github.com/kubetail-org/kubetail/modules/shared/config"
	sharedk8shelpers "github.com/kubetail-org/kubetail/modules/shared/k8shelpers"

	"github.com/kubetail-org/kubetail/modules/dashboard/internal/k8shelpers"
)

type ProxyHandlers struct {
	*GinApp
}

func (app *ProxyHandlers) EndpointHandler(prefix string, cfg *config.Config, k8scfg *rest.Config) (gin.HandlerFunc, error) {
	// Handle test-mode
	if k8scfg == nil {
		return func(c *gin.Context) {
			panic("not implemented")
		}, nil
	}

	// Add bearer token middleware
	k8scfgCopy := rest.CopyConfig(k8scfg)
	k8scfgCopy.WrapTransport = func(transport http.RoundTripper) http.RoundTripper {
		return sharedk8shelpers.NewBearerTokenRoundTripper(transport)
	}

	// Initialize handler
	h, err := proxy.NewProxyHandler("/", nil, k8scfgCopy, 0, false)
	if err != nil {
		return nil, err
	}

	// Initialize service account token (if necessary)
	var sat *k8shelpers.ServiceAccountToken
	if cfg.AuthMode == config.AuthModeLocal && k8scfg.BearerToken == "" {
		if tmp, err := k8shelpers.NewServiceAccountToken("kubetail-system", "kubetail-cli", k8scfg, app.shutdownCh); err != nil {
			return nil, err
		} else {
			sat = tmp
		}
	}

	// Warm up handler in background
	go func() {
		r, _ := http.NewRequest("GET", "/", nil)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, r)
	}()

	return func(c *gin.Context) {
		relPath := strings.TrimPrefix(c.Request.URL.Path, prefix)
		newURL := *c.Request.URL
		newURL.Path = path.Join("/api/v1/namespaces/kubetail-system/services/kubetail-api:http/proxy", relPath)
		c.Request.URL = &newURL

		// Handle Auth
		token := c.GetString(k8sTokenCtxKey)
		if token != "" {
			c.Request.Header.Add("X-Forwarded-Authorization", fmt.Sprintf("Bearer %s", token))
		} else if sat != nil {
			c.Request.Header.Add("X-Forwarded-Authorization", fmt.Sprintf("Bearer %s", sat.Token()))
		} else if k8scfg.BearerToken != "" {
			c.Request.Header.Add("X-Forwarded-Authorization", fmt.Sprintf("Bearer %s", k8scfg.BearerToken))
		}

		h.ServeHTTP(c.Writer, c.Request)
	}, nil
}
