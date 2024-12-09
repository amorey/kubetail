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
	"github.com/gin-gonic/gin"
	zlog "github.com/rs/zerolog/log"
	"k8s.io/client-go/rest"
	"k8s.io/kubectl/pkg/proxy"
)

func newKubetailAPIProxyHandler(cfg *rest.Config) gin.HandlerFunc {
	h, err := proxy.NewProxyHandler("/", nil, cfg, 0, false)
	if err != nil {
		zlog.Fatal().Err(err).Send()
	}

	return func(c *gin.Context) {
		urlCopy := *c.Request.URL
		urlCopy.Path = "/api/v1/namespaces/kubetail-system/services/kubetail-api:http/proxy/graphql"
		c.Request.URL = &urlCopy
		h.ServeHTTP(c.Writer, c.Request)
	}
}
