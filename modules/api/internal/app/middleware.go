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

package app

import (
	"context"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/kubetail-org/kubetail/modules/shared/config"
	"github.com/kubetail-org/kubetail/modules/shared/grpchelpers"
)

// Add user to context if authenticated
func authenticationMiddleware(mode config.AuthMode) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip if not in token mode
		if mode != config.AuthModeToken {
			c.Next()
			return
		}

		var token string

		/*
			// check cookie session
			session := sessions.Default(c)
			tokenIF := session.Get(k8sTokenSessionKey)
			if tokenIF != nil {
				token = tokenIF.(string)
			}
		*/

		// Check Authorization header
		header := c.GetHeader("Authorization")
		if strings.HasPrefix(header, "Bearer ") {
			token = strings.TrimPrefix(header, "Bearer ")
		}

		// If present, add token to request context
		if token != "" {
			// Add to context for grpc requests
			ctx := context.WithValue(c.Request.Context(), grpchelpers.K8STokenCtxKey, token)

			c.Request = c.Request.WithContext(ctx)
		}

		// continue with the request
		c.Next()
	}
}
