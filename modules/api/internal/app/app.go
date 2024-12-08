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
	"net/http"

	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/requestid"
	"github.com/gin-gonic/gin"

	grpcdispatcher "github.com/kubetail-org/grpc-dispatcher-go"

	"github.com/kubetail-org/kubetail/modules/common/config"
)

type app struct {
	*gin.Engine
	grpcDispatcher *grpcdispatcher.Dispatcher
}

// Shutdown
func (a *app) Shutdown() {
	// stop grpc dispatcher
	if a.grpcDispatcher != nil {
		// TODO: log dispatcher shutdown errors
		a.grpcDispatcher.Shutdown()
	}
}

// Create new gin app
func NewApp(cfg *config.Config) (*app, error) {
	// Init app
	app := &app{Engine: gin.New()}

	// If not in test-mode
	if gin.Mode() != gin.TestMode {
		app.Use(gin.Recovery())

		// init grpc dispatcher
		app.grpcDispatcher = mustNewGrpcDispatcher(cfg)
	}

	// Add request-id middleware
	app.Use(requestid.New())

	// Add logging middleware
	if cfg.API.Logging.AccessLog.Enabled {
		app.Use(loggingMiddleware(cfg.API.Logging.AccessLog.HideHealthChecks))
	}

	// Gzip middleware
	app.Use(gzip.Gzip(gzip.DefaultCompression))

	// Routes
	root := app.Group(cfg.Dashboard.BasePath)

	// Serve GraphQL playground at root
	root.GET("/", gin.WrapH(playground.Handler("Kubetail API Playground", "/graphql")))

	// Health endpoint
	root.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "ok",
		})
	})

	// GraphQL routes
	graphql := root.Group("/graphql")
	{
		h := &GraphQLHandlers{app}
		endpointHandler := h.EndpointHandler(cfg.AllowedNamespaces)
		graphql.GET("", endpointHandler)
		graphql.POST("", endpointHandler)
	}

	return app, nil
}
