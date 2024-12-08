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
	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/gin-gonic/gin"
	zlog "github.com/rs/zerolog/log"

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
	h := handler.NewDefaultServer(schema)

	return gin.WrapH(h)
}
