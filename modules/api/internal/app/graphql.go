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
	"time"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/lru"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	zlog "github.com/rs/zerolog/log"
	"github.com/vektah/gqlparser/v2/ast"

	"github.com/kubetail-org/kubetail/modules/api/graph"
)

type GraphQLHandlers struct {
	*app
}

func (a *GraphQLHandlers) EndpointHandler(allowedNamespaces []string) gin.HandlerFunc {
	// Init resolver
	r, err := graph.NewResolver(a.grpcDispatcher, allowedNamespaces)
	if err != nil {
		zlog.Fatal().Err(err).Send()
	}

	// Init config
	cfg := graph.Config{Resolvers: r}

	// Init schema
	schema := graph.NewExecutableSchema(cfg)

	// Init handler
	h := handler.New(schema)

	// Add transports from NewDefaultServer()
	h.AddTransport(transport.GET{})
	h.AddTransport(transport.POST{})

	h.SetQueryCache(lru.New[*ast.QueryDocument](1000))

	// Configure WebSocket (without CORS)
	h.AddTransport(&transport.Websocket{
		Upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				// We have to return true here because `kubectl proxy` modifies the Host header
				// so requests will fail same-origin tests and unfortunately not all browsers
				// have implemented `sec-fetch-site` header. Instead, we will use CSRF token
				// validation to ensure requests are coming from the same site.
				return true
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
		KeepAlivePingInterval: 10 * time.Second,
	})

	h.Use(extension.Introspection{})
	h.Use(extension.AutomaticPersistedQuery{
		Cache: lru.New[string](100),
	})

	return gin.WrapH(h)
}
