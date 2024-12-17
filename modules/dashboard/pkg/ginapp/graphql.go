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
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"time"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/gin-gonic/gin"
	zlog "github.com/rs/zerolog/log"
	"k8s.io/client-go/rest"

	"github.com/kubetail-org/kubetail/modules/dashboard/graph"
)

type key int

const graphQLCookiesCtxKey key = iota

type GraphQLHandlers struct {
	*GinApp
	resolver *graph.Resolver
	server   *handler.Server
}

// GET|POST "/graphql": GraphQL query endpoint
func (app *GraphQLHandlers) EndpointHandler(c *gin.Context) {
	/*
		// init resolver
		r, err := graph.NewResolver(cfg, allowedNamespaces)
		if err != nil {
			zlog.Fatal().Err(err).Send()
		}

		// warm up in background
		r.WarmUp()

		// Setup csrf query method
		var csrfProtect http.Handler
		if csrfProtectMiddleware != nil {
			csrfProtect = csrfProtectMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
		}

		// init handler options
		opts := graph.NewDefaultHandlerOptions()

		// Because we had to disable same-origin checks in the CheckOrigin() handler
		// we will use use CSRF token validation to ensure requests are coming from
		// the same site. (See https://dev.to/pssingh21/websockets-bypassing-sop-cors-5ajm)
		opts.WSInitFunc = func(ctx context.Context, initPayload transport.InitPayload) (context.Context, *transport.InitPayload, error) {
			// check if csrf protection is disabled
			if csrfProtectMiddleware == nil {
				return ctx, &initPayload, nil
			}

			csrfToken := initPayload.Authorization()

			cookies, ok := ctx.Value(graphQLCookiesCtxKey).([]*http.Cookie)
			if !ok {
				return ctx, nil, errors.New("AUTHORIZATION_REQUIRED")
			}

			// make mock request
			r, _ := http.NewRequest("POST", "/", nil)
			for _, cookie := range cookies {
				r.AddCookie(cookie)
			}
			r.Header.Set("X-CSRF-Token", csrfToken)

			// run request through csrf protect function
			rr := httptest.NewRecorder()
			csrfProtect.ServeHTTP(rr, r)

			if rr.Code != 200 {
				return ctx, nil, errors.New("AUTHORIZATION_REQUIRED")
			}

			// close websockets on shutdown signal
			ctx, cancel := context.WithCancel(ctx)
			go func() {
				defer cancel()
				<-app.shutdownCh
			}()

			return ctx, &initPayload, nil
		}

		// init handler
		h := graph.NewHandler(r, opts)

		// return gin handler func
		return func(c *gin.Context) {
			// save cookies for use in WSInitFunc
			ctx := context.WithValue(c.Request.Context(), graphQLCookiesCtxKey, c.Request.Cookies())
			c.Request = c.Request.WithContext(ctx)

			// execute
			h.ServeHTTP(c.Writer, c.Request)
		}
	*/

	// save cookies for use in WSInitFunc
	ctx := context.WithValue(c.Request.Context(), graphQLCookiesCtxKey, c.Request.Cookies())
	c.Request = c.Request.WithContext(ctx)

	// execute
	app.server.ServeHTTP(c.Writer, c.Request)
}

// GET "/readywait"
func (app *GraphQLHandlers) ReadyWaitHandler(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()

	if err := app.resolver.WaitUntilReady(ctx); err != nil {
		zlog.Error().Err(err).Send()
	}

	c.AbortWithStatus(http.StatusNoContent)
}

// Create new GraphQLHandlers instance
func NewGraphQLHandlers(app *GinApp, cfg *rest.Config, allowedNamespaces []string, csrfProtectMiddleware func(http.Handler) http.Handler) (*GraphQLHandlers, error) {
	// init resolver
	r, err := graph.NewResolver(cfg, allowedNamespaces)
	if err != nil {
		return nil, err
	}

	// warm up in background
	r.WarmUp()

	// Setup csrf query method
	var csrfProtect http.Handler
	if csrfProtectMiddleware != nil {
		csrfProtect = csrfProtectMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	}

	// init handler options
	opts := graph.NewDefaultHandlerOptions()

	// Because we had to disable same-origin checks in the CheckOrigin() handler
	// we will use use CSRF token validation to ensure requests are coming from
	// the same site. (See https://dev.to/pssingh21/websockets-bypassing-sop-cors-5ajm)
	opts.WSInitFunc = func(ctx context.Context, initPayload transport.InitPayload) (context.Context, *transport.InitPayload, error) {
		// check if csrf protection is disabled
		if csrfProtectMiddleware == nil {
			return ctx, &initPayload, nil
		}

		csrfToken := initPayload.Authorization()

		cookies, ok := ctx.Value(graphQLCookiesCtxKey).([]*http.Cookie)
		if !ok {
			return ctx, nil, errors.New("AUTHORIZATION_REQUIRED")
		}

		// make mock request
		r, _ := http.NewRequest("POST", "/", nil)
		for _, cookie := range cookies {
			r.AddCookie(cookie)
		}
		r.Header.Set("X-CSRF-Token", csrfToken)

		// run request through csrf protect function
		rr := httptest.NewRecorder()
		csrfProtect.ServeHTTP(rr, r)

		if rr.Code != 200 {
			return ctx, nil, errors.New("AUTHORIZATION_REQUIRED")
		}

		// close websockets on shutdown signal
		ctx, cancel := context.WithCancel(ctx)
		go func() {
			defer cancel()
			<-app.shutdownCh
		}()

		return ctx, &initPayload, nil
	}

	// init handler
	h := graph.NewHandler(r, opts)

	return &GraphQLHandlers{
		GinApp:   app,
		resolver: r,
		server:   h,
	}, nil
}
