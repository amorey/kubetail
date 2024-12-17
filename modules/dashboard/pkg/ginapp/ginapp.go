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
	"html/template"
	"io/fs"
	"net/http"
	"path"

	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/requestid"
	"github.com/gin-contrib/secure"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/csrf"
	adapter "github.com/gwatts/gin-adapter"
	"k8s.io/client-go/rest"

	"github.com/kubetail-org/kubetail/modules/shared/config"
	"github.com/kubetail-org/kubetail/modules/shared/middleware"

	"github.com/kubetail-org/kubetail/modules/dashboard"
	"github.com/kubetail-org/kubetail/modules/dashboard/internal/k8shelpers"
)

type GinApp struct {
	*gin.Engine
	k8sHelperService k8shelpers.Service
	shutdownCh       chan struct{}

	// for testing
	dynamicroutes *gin.RouterGroup
	wraponce      gin.HandlerFunc
}

func (app *GinApp) Shutdown() {
	// send shutdown signal to internal processes
	if app.shutdownCh != nil {
		close(app.shutdownCh)
	}
}

// Create new gin app
func NewGinApp(cfg *config.Config) (*GinApp, error) {
	// init app
	app := &GinApp{
		Engine:     gin.New(),
		shutdownCh: make(chan struct{}),
	}

	// only if not in test-mode
	var k8sCfg *rest.Config
	if gin.Mode() != gin.TestMode {
		// configure kubernetes
		k8sCfg = mustConfigureK8S(cfg)

		// init k8s helper service
		app.k8sHelperService = k8shelpers.NewK8sHelperService(k8sCfg, k8shelpers.Mode(cfg.AuthMode))

		// add recovery middleware
		app.Use(gin.Recovery())
	}

	// for tests
	if gin.Mode() == gin.TestMode {
		app.Use(func(c *gin.Context) {
			if app.wraponce != nil {
				defer func() { app.wraponce = nil }()
				app.wraponce(c)
			} else {
				c.Next()
			}
		})
	}

	// register templates
	tmpl := template.Must(template.New("").
		Funcs(template.FuncMap{
			"pathJoin": path.Join,
		}).
		ParseFS(dashboard.TemplatesEmbedFS, "templates/*"),
	)
	app.SetHTMLTemplate(tmpl)

	// add request-id middleware
	app.Use(requestid.New())

	// add logging middleware
	if cfg.Dashboard.Logging.AccessLog.Enabled {
		app.Use(middleware.LoggingMiddleware(cfg.Dashboard.Logging.AccessLog.HideHealthChecks))
	}

	// gzip middleware
	app.Use(gzip.Gzip(gzip.DefaultCompression, gzip.WithExcludedPaths([]string{"/kubetail-api"})))

	// root route
	root := app.Group(cfg.Dashboard.BasePath)

	// dynamic routes
	dynamicRoutes := root.Group("/")
	{
		// session middleware
		sessionStore := cookie.NewStore([]byte(cfg.Dashboard.Session.Secret))
		sessionStore.Options(sessions.Options{
			Path:     cfg.Dashboard.Session.Cookie.Path,
			Domain:   cfg.Dashboard.Session.Cookie.Domain,
			MaxAge:   cfg.Dashboard.Session.Cookie.MaxAge,
			Secure:   cfg.Dashboard.Session.Cookie.Secure,
			HttpOnly: cfg.Dashboard.Session.Cookie.HttpOnly,
			SameSite: cfg.Dashboard.Session.Cookie.SameSite,
		})
		dynamicRoutes.Use(sessions.Sessions(cfg.Dashboard.Session.Cookie.Name, sessionStore))

		// https://security.stackexchange.com/questions/147554/security-headers-for-a-web-api
		// https://observatory.mozilla.org/faq/
		dynamicRoutes.Use(secure.New(secure.Config{
			STSSeconds:            63072000,
			FrameDeny:             true,
			ContentSecurityPolicy: "default-src 'none'; frame-ancestors 'none'",
			ContentTypeNosniff:    true,
		}))

		// disable csrf protection for graphql endpoint (already rejects simple requests)
		dynamicRoutes.Use(func(c *gin.Context) {
			if c.Request.URL.Path == path.Join(cfg.Dashboard.BasePath, "/graphql") {
				c.Request = csrf.UnsafeSkipCheck(c.Request)
			}
			c.Next()
		})

		var csrfProtect func(http.Handler) http.Handler

		// csrf middleware
		if cfg.Dashboard.CSRF.Enabled {
			csrfProtect = csrf.Protect(
				[]byte(cfg.Dashboard.CSRF.Secret),
				csrf.FieldName(cfg.Dashboard.CSRF.FieldName),
				csrf.CookieName(cfg.Dashboard.CSRF.Cookie.Name),
				csrf.Path(cfg.Dashboard.CSRF.Cookie.Path),
				csrf.Domain(cfg.Dashboard.CSRF.Cookie.Domain),
				csrf.MaxAge(cfg.Dashboard.CSRF.Cookie.MaxAge),
				csrf.Secure(cfg.Dashboard.CSRF.Cookie.Secure),
				csrf.HttpOnly(cfg.Dashboard.CSRF.Cookie.HttpOnly),
				csrf.SameSite(cfg.Dashboard.CSRF.Cookie.SameSite),
			)

			// add to gin middleware
			dynamicRoutes.Use(adapter.Wrap(csrfProtect))

			// token fetcher helper
			dynamicRoutes.GET("/csrf-token", func(c *gin.Context) {
				c.JSON(http.StatusOK, gin.H{"value": csrf.Token(c.Request)})
			})
		}

		// authentication middleware
		dynamicRoutes.Use(authenticationMiddleware(cfg.AuthMode))

		// auth routes
		auth := dynamicRoutes.Group("/api/auth")
		{
			h := &AuthHandlers{GinApp: app, mode: cfg.AuthMode}
			auth.POST("/login", h.LoginPOST)
			auth.POST("/logout", h.LogoutPOST)
			auth.GET("/session", h.SessionGET)
		}

		// graphql routes
		graphql := dynamicRoutes.Group("/graphql")
		{
			// require token
			if cfg.AuthMode == config.AuthModeToken {
				graphql.Use(k8sTokenRequiredMiddleware)
			}

			// graphql handler
			h := &GraphQLHandlers{app}
			endpointHandler := h.EndpointHandler(k8sCfg, cfg.AllowedNamespaces, csrfProtect)
			graphql.GET("", endpointHandler)
			graphql.POST("", endpointHandler)
		}
	}
	app.dynamicroutes = dynamicRoutes // for unit tests

	// kubetail api proxy routes
	kubetailAPI := root.Group("/kubetail-api")
	{
		// require token
		if cfg.AuthMode == config.AuthModeToken {
			kubetailAPI.Use(k8sTokenRequiredMiddleware)
		}

		h := &ProxyHandlers{app}
		prefix := path.Join(cfg.Dashboard.BasePath, "kubetail-api")
		endpointHandler, err := h.EndpointHandler(prefix, cfg, k8sCfg)
		if err != nil {
			return nil, err
		}
		kubetailAPI.Any("*path", endpointHandler)
	}

	// health routes
	root.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "ok",
		})
	})

	// serve website from "/" and also unknown routes
	websiteFS, err := fs.Sub(dashboard.WebsiteEmbedFS, "website")
	if err != nil {
		return nil, err
	}

	h := &WebsiteHandlers{app, websiteFS}
	h.InitStaticHandlers(root)

	endpointHandler := h.EndpointHandler(cfg)
	root.GET("/", endpointHandler)
	app.NoRoute(endpointHandler)

	return app, nil
}
