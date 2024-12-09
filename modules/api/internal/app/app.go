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
	"path"

	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/requestid"
	"github.com/gin-contrib/secure"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/csrf"
	adapter "github.com/gwatts/gin-adapter"

	grpcdispatcher "github.com/kubetail-org/grpc-dispatcher-go"

	"github.com/kubetail-org/kubetail/modules/common/config"
)

type app struct {
	*gin.Engine
	grpcDispatcher *grpcdispatcher.Dispatcher
	shutdownCh     chan struct{}
}

// Shutdown
func (a *app) Shutdown() {
	// stop grpc dispatcher
	if a.grpcDispatcher != nil {
		// TODO: log dispatcher shutdown errors
		a.grpcDispatcher.Shutdown()
	}

	// Send shutdown signal to internal processes
	if a.shutdownCh != nil {
		close(a.shutdownCh)
	}
}

// Create new gin app
func NewApp(cfg *config.Config) (*app, error) {
	// Init app
	app := &app{
		Engine:     gin.New(),
		shutdownCh: make(chan struct{}),
	}

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
	root := app.Group(cfg.API.BasePath)

	// Dynamic routes
	dynamicRoutes := root.Group("/")
	{
		// https://security.stackexchange.com/questions/147554/security-headers-for-a-web-api
		// https://observatory.mozilla.org/faq/
		dynamicRoutes.Use(secure.New(secure.Config{
			STSSeconds:            63072000,
			FrameDeny:             true,
			ContentSecurityPolicy: "default-src 'none'; frame-ancestors 'none'",
			ContentTypeNosniff:    true,
		}))

		// Disable csrf protection for graphql endpoint (already rejects simple requests)
		dynamicRoutes.Use(func(c *gin.Context) {
			if c.Request.URL.Path == path.Join(cfg.API.BasePath, "/graphql") {
				c.Request = csrf.UnsafeSkipCheck(c.Request)
			}
			c.Next()
		})

		var csrfProtect func(http.Handler) http.Handler

		// CSRF middleware
		if cfg.API.CSRF.Enabled {
			csrfProtect = csrf.Protect(
				[]byte(cfg.API.CSRF.Secret),
				csrf.FieldName(cfg.API.CSRF.FieldName),
				csrf.CookieName(cfg.API.CSRF.Cookie.Name),
				csrf.Path(cfg.API.CSRF.Cookie.Path),
				csrf.Domain(cfg.API.CSRF.Cookie.Domain),
				csrf.MaxAge(cfg.API.CSRF.Cookie.MaxAge),
				csrf.Secure(cfg.API.CSRF.Cookie.Secure),
				csrf.HttpOnly(cfg.API.CSRF.Cookie.HttpOnly),
				csrf.SameSite(cfg.API.CSRF.Cookie.SameSite),
			)

			// Add to gin middleware
			dynamicRoutes.Use(adapter.Wrap(csrfProtect))

			// Add token fetcher helper
			dynamicRoutes.GET("/csrf-token", func(c *gin.Context) {
				c.JSON(http.StatusOK, gin.H{"value": csrf.Token(c.Request)})
			})
		}

		// Serve GraphQL playground at root
		dynamicRoutes.GET("/", gin.WrapH(playground.Handler("Kubetail API Playground", "/graphql")))

		// GraphQL endpoint
		graphql := dynamicRoutes.Group("/graphql")
		{
			h := &GraphQLHandlers{app}
			endpointHandler := h.EndpointHandler(cfg.AllowedNamespaces, csrfProtect)
			graphql.GET("", endpointHandler)
			graphql.POST("", endpointHandler)
		}
	}

	// Health endpoint
	root.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "ok",
		})
	})

	return app, nil
}
