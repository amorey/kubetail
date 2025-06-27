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

package app

import (
	"context"
	"crypto/x509"
	"fmt"
	"os"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/kubetail-org/kubetail/modules/shared/grpchelpers"
	"github.com/kubetail-org/kubetail/modules/shared/k8shelpers"
)

// Add user to context if authenticated
func authenticationMiddleware(c *gin.Context) {
	var token string

	// Check X-Forwarded-Authorization & Authorization headers
	header := c.GetHeader("X-Forwarded-Authorization")
	if header == "" {
		header = c.GetHeader("Authorization")
	}
	if strings.HasPrefix(header, "Bearer ") {
		token = strings.TrimPrefix(header, "Bearer ")
	}

	// Add to context for kubernetes requests
	if token != "" {
		ctx := context.WithValue(c.Request.Context(), k8shelpers.K8STokenCtxKey, token)
		c.Request = c.Request.WithContext(ctx)
	}

	// Add to context for gRPC requests
	if token != "" {
		ctx := context.WithValue(c.Request.Context(), grpchelpers.K8STokenCtxKey, token)
		c.Request = c.Request.WithContext(ctx)
	}

	// Continue
	c.Next()
}

func authenticationMiddleware2(c *gin.Context) {
	caCert, err := os.ReadFile("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt")
	if err != nil {
		fmt.Println("ca.crt nope")
		c.Next()
		return
	}

	clientCAs := x509.NewCertPool()
	if !clientCAs.AppendCertsFromPEM(caCert) {
		fmt.Println("asfsdf")
		c.Next()
		return
	}

	r := c.Request

	// Check if client certificate was provided and verified
	if r.TLS == nil || len(r.TLS.PeerCertificates) == 0 {
		fmt.Println("no client certificate provided")
		c.Next()
		return
	}

	// Verify the client certificate is from kube-apiserver
	clientCert := r.TLS.PeerCertificates[0]

	// Check if it's signed by our trusted CA
	opts := x509.VerifyOptions{
		Roots: clientCAs,
	}

	if _, err := clientCert.Verify(opts); err != nil {
		fmt.Println(err)
		c.Next()
		return
	}

	userHeader := c.GetHeader("X-Remote-User")
	groupHeaders := c.Request.Header["X-Remote-Group"]

	// Any extra fields you allowed?
	extra := map[string][]string{}
	for k, vs := range c.Request.Header {
		if strings.HasPrefix(k, "X-Remote-Extra-") {
			key := strings.TrimPrefix(k, "X-Remote-Extra-")
			extra[key] = vs
		}
	}

	fmt.Println("user", userHeader)
	fmt.Println("group", groupHeaders)
	fmt.Println("extra", extra)

	c.Next()
}
