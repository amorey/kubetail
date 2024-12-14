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

package grpchelpers

import (
	"context"
	"fmt"

	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"

	"github.com/kubetail-org/kubetail/modules/shared/config"
)

type ctxKey int

const K8STokenCtxKey ctxKey = iota

// Create new auth server interceptor
func NewUnaryAuthServerInterceptor(cfg *config.Config) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		// Add token to context, if present
		if md, ok := metadata.FromIncomingContext(ctx); ok {
			authorization := md["authorization"]
			if len(authorization) > 0 {
				fmt.Println(authorization[0])

				// Add token to context
				ctx = context.WithValue(ctx, K8STokenCtxKey, authorization[0])
			}
		}

		// Continue
		return handler(ctx, req)
	}
}

// Create new auth client interceptor
func NewUnaryAuthClientInterceptor(cfg *config.Config) grpc.UnaryClientInterceptor {
	return func(ctx context.Context, method string, req, reply interface{}, cc *grpc.ClientConn, invoker grpc.UnaryInvoker, opts ...grpc.CallOption) error {
		// Get token context and add to metadata, if present
		if token, ok := ctx.Value(K8STokenCtxKey).(string); ok {
			ctx = metadata.AppendToOutgoingContext(ctx, "authorization", token)
		}

		// Continue
		return invoker(ctx, method, req, reply, cc, opts...)
	}
}
