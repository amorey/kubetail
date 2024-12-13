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
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/kubetail-org/kubetail/modules/shared/grpchelpers"
)

// Add user to context if authenticated
func authenticationMiddleware(c *gin.Context) {
	for key, values := range c.Request.Header {
		for _, value := range values {
			fmt.Printf("%s: %s\n", key, value)
		}
	}

	var token string

	// Check X-Forwarded-Authorization & Authorization headers
	header := c.GetHeader("X-Forwarded-Authorization")
	if header == "" {
		header = c.GetHeader("Authorization")
	}
	if strings.HasPrefix(header, "Bearer ") {
		token = strings.TrimPrefix(header, "Bearer ")
	}

	// Require token
	if token == "" {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}

	// Add to context for grpc requests
	ctx := context.WithValue(c.Request.Context(), grpchelpers.K8STokenCtxKey, token)

	c.Request = c.Request.WithContext(ctx)

	// Continue
	c.Next()
}
