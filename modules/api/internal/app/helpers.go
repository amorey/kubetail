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
	grpcdispatcher "github.com/kubetail-org/grpc-dispatcher-go"
	zlog "github.com/rs/zerolog/log"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/kubetail-org/kubetail/modules/common/config"
	"github.com/kubetail-org/kubetail/modules/common/grpchelpers"
)

func mustNewGrpcDispatcher(cfg *config.Config) *grpcdispatcher.Dispatcher {
	dialOpts := []grpc.DialOption{
		grpc.WithUnaryInterceptor(grpchelpers.NewUnaryAuthClientInterceptor(cfg)),
	}

	// configure tls
	if cfg.Agent.TLS.Enabled {
		creds, err := credentials.NewServerTLSFromFile(cfg.Agent.TLS.CertFile, cfg.Agent.TLS.KeyFile)
		if err != nil {
			zlog.Fatal().Err(err).Send()
		}
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(creds))
	} else {
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	// TODO: reuse app clientset
	d, err := grpcdispatcher.NewDispatcher(
		cfg.API.AgentDispatchUrl,
		grpcdispatcher.WithDialOptions(dialOpts...),
	)
	if err != nil {
		zlog.Fatal().Err(err).Send()
	}

	// start background processes
	d.Start()

	return d
}