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

package graph

import (
	"context"
	"net/http"
	"slices"
	"time"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/lru"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/gorilla/websocket"
	"github.com/vektah/gqlparser/v2/ast"

	grpcdispatcher "github.com/kubetail-org/grpc-dispatcher-go"

	"github.com/kubetail-org/kubetail/modules/shared/graphql/directives"
	sharedwebsocket "github.com/kubetail-org/kubetail/modules/shared/graphql/websocket"
	"github.com/kubetail-org/kubetail/modules/shared/k8shelpers"
)

// Represents Server
type Server struct {
	r          *Resolver
	h          http.Handler
	shutdownCh chan struct{}
}

// allowedSecFetchSite defines the secure values for the Sec-Fetch-Site header.
// It's defined at the package level to avoid re-allocation on every WebSocket upgrade request.
var allowedSecFetchSite = []string{"same-origin"}

// Create new Server instance
func NewServer(cm k8shelpers.ConnectionManager, grpcDispatcher *grpcdispatcher.Dispatcher, allowedNamespaces []string) *Server {
	// Init resolver
	r := &Resolver{cm, grpcDispatcher, allowedNamespaces}

	// Init config
	cfg := Config{Resolvers: r}
	cfg.Directives.Validate = directives.ValidateDirective
	cfg.Directives.NullIfValidationFailed = directives.NullIfValidationFailedDirective

	// Init schema
	schema := NewExecutableSchema(cfg)

	// Init handler
	h := handler.New(schema)

	// Add transports from NewDefaultServer()
	h.AddTransport(transport.GET{})
	h.AddTransport(transport.POST{})

	h.SetQueryCache(lru.New[*ast.QueryDocument](1000))

	// Configure WebSocket (without CORS)
	shutdownCh := make(chan struct{})

	h.AddTransport(&transport.Websocket{
		Upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				// Check the Sec-Fetch-Site header for an additional layer of security.
				secFetchSite := r.Header.Get("Sec-Fetch-Site")

				// If header is not available, continue
				if secFetchSite == "" {
					return true
				}

				// For modern browsers that send the header, enforce strict same-site policies.
				// This is the primary defense against Cross-Site WebSocket Hijacking (CSWSH).
				return slices.Contains(allowedSecFetchSite, secFetchSite)
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
		KeepAlivePingInterval: 10 * time.Second,
		InitFunc: func(ctx context.Context, initPayload transport.InitPayload) (context.Context, *transport.InitPayload, error) {
			// Close websockets on shutdown signal
			ctx, cancel := context.WithCancel(ctx)
			go func() {
				defer cancel()
				select {
				case <-ctx.Done():
				case <-shutdownCh:
				}
			}()

			return ctx, &initPayload, nil
		},
	})

	h.Use(extension.Introspection{})
	h.Use(extension.AutomaticPersistedQuery{
		Cache: lru.New[string](100),
	})

	return &Server{r, h, shutdownCh}
}

// Shutdown
func (s *Server) Shutdown() {
	close(s.shutdownCh)
}

// ServeHTTP
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Add cookies to context for use in WSInitFunc
	ctx := context.WithValue(r.Context(), sharedwebsocket.CookiesCtxKey, r.Cookies())

	// Execute
	s.h.ServeHTTP(w, r.WithContext(ctx))
}
