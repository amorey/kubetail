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
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

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

// Initialize new authentication middleware method
func newAuthenticationMiddleware(ctx context.Context, cm k8shelpers.ConnectionManager) (gin.HandlerFunc, error) {
	clientset, err := cm.GetOrCreateClientset("")
	if err != nil {
		return nil, err
	}

	// Get configmap
	configmap, err := clientset.CoreV1().ConfigMaps("kube-system").Get(ctx, "extension-apiserver-authentication", metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	// Init clientCA
	clientCAPool := x509.NewCertPool()
	if ok := clientCAPool.AppendCertsFromPEM([]byte(configmap.Data["client-ca-file"])); !ok {
		return nil, fmt.Errorf("failed to parse client-ca-file PEM")
	}

	// Init proxyCA
	proxyCAPool := x509.NewCertPool()
	if ok := proxyCAPool.AppendCertsFromPEM([]byte(configmap.Data["requestheader-client-ca-file"])); !ok {
		return nil, fmt.Errorf("failed to parse requestheader-client-ca-file PEM")
	}

	// Parse other args
	var allowedNames, usernameHeaders, groupHeaders, extraHeadersPrefixes []string
	if err := json.Unmarshal([]byte(configmap.Data["requestheader-allowed-names"]), &allowedNames); err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(configmap.Data["requestheader-username-headers"]), &usernameHeaders); err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(configmap.Data["requestheader-group-headers"]), &groupHeaders); err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(configmap.Data["requestheader-extra-headers-prefix"]), &extraHeadersPrefixes); err != nil {
		return nil, err
	}

	return func(c *gin.Context) {
		r := c.Request

		// Reject requests that don't present client certificates
		if r.TLS == nil || len(r.TLS.PeerCertificates) == 0 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "client certificate required",
			})
			return
		}

		// mTLS path
		opts1 := x509.VerifyOptions{
			Roots:       clientCAPool,
			CurrentTime: time.Now(),
			KeyUsages:   []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
		}

		clientCert := r.TLS.PeerCertificates[0]
		if _, err := clientCert.Verify(opts1); err == nil {
			c.Set("user", clientCert.Subject.CommonName)
			c.Next()
			return
		}

		// front-proxy path
		opts2 := x509.VerifyOptions{
			Roots:         proxyCAPool,
			CurrentTime:   time.Now(),
			KeyUsages:     []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
			Intermediates: x509.NewCertPool(),
		}

		for _, cert := range r.TLS.PeerCertificates[1:] {
			opts2.Intermediates.AddCert(cert)
		}

		var proxyCert *x509.Certificate
		for _, cert := range r.TLS.PeerCertificates {
			if _, err := cert.Verify(opts2); err == nil {
				proxyCert = cert
				break
			}
		}
		if proxyCert == nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "no valid certificate found",
			})
			return
		}

		// Enforce allowed-names
		if len(allowedNames) > 0 {
			cn := proxyCert.Subject.CommonName
			if !slices.Contains(allowedNames, cn) {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
					"error": fmt.Sprintf("proxy CN %q not in allowed list", cn),
				})
				return
			}
		}

		// Extract user
		var user string
		for _, h := range usernameHeaders {
			if v := c.GetHeader(h); v != "" {
				user = v
				break
			}
		}
		if user == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing user header"})
			return
		}
		c.Set("user", user)

		// Extract groups
		var groups []string
		for _, h := range groupHeaders {
			if v := c.GetHeader(h); v != "" {
				groups = append(groups, strings.Split(v, ",")...)
				break
			}
		}
		c.Set("groups", groups)

		// Extract extras
		extras := map[string][]string{}
		for name, vals := range c.Request.Header {
			for _, prefix := range extraHeadersPrefixes {
				if after, ok := strings.CutPrefix(name, prefix); ok {
					extras[after] = vals
				}
			}
		}
		c.Set("extras", extras)

		c.Next()
	}, nil
}
