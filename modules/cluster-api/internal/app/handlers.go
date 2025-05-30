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
	"net/http"

	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// Kubernetes API extension group discovery handler
func extGroupDiscoveryHandler(c *gin.Context) {
	c.JSON(http.StatusOK, &metav1.APIGroup{
		Name: "api.kubetail.com",
		Versions: []metav1.GroupVersionForDiscovery{
			{
				GroupVersion: "api.kubetail.com/v1",
				Version:      "v1",
			},
		},
		PreferredVersion: metav1.GroupVersionForDiscovery{
			GroupVersion: "api.kubetail.com/v1",
			Version:      "v1",
		},
	})
}

// Kubernetes API extension version discovery handler
func extVersionDiscoveryHandler(c *gin.Context) {
	c.JSON(http.StatusOK, &metav1.APIResourceList{
		GroupVersion: "api.kubetail.com/v1",
		APIResources: []metav1.APIResource{{
			Name:       "dummy",
			Namespaced: false,
			Kind:       "Dummy",
			Verbs:      []string{"get"},
		}},
	})
}

// OpenAPI v3 nil response
func openAPIV3NilSpecHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"openapi": "3.0.0",
		"paths": gin.H{
			"/openapi/v3":                          gin.H{},
			"/openapi/v3/apis/api.kubetail.com/v1": gin.H{},
		},
	})
}

// OpenAPI v3 endpoint nil response
func openAPIV3NilEndpointHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"openapi": "3.0.0",
		"info": gin.H{
			"title":   "api.kubetail.com",
			"version": "v1",
		},
		"paths":      gin.H{},
		"components": gin.H{},
	})
}

// Dummy endpoint
// @Summary Dummy response
// @Produce json
// @Success 200 {object} map[string]string "returns dummy response"
// @Router  /api.kubetail.com/v1/dummy [get]
func dummyHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"dummy": true,
	})
}

// Health endpoint
func healthzHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
	})
}
