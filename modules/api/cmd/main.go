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

package main

import (
	"context"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-playground/validator/v10"
	zlog "github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"google.golang.org/grpc/health"
	"google.golang.org/grpc/health/grpc_health_v1"

	"github.com/kubetail-org/kubetail/modules/common/config"

	"github.com/kubetail-org/kubetail/modules/api/internal/server"
)

type CLI struct {
	Config string `validate:"omitempty,file"`
}

func main() {
	var cli CLI
	var params []string

	// Init cobra command
	cmd := cobra.Command{
		Use:   "kubetail-api",
		Short: "Kubetail API",
		PreRunE: func(cmd *cobra.Command, args []string) error {
			// Validate CLI flags
			return validator.New().Struct(cli)
		},
		Run: func(cmd *cobra.Command, args []string) {
			// Listen for termination signals as early as possible
			quit := make(chan os.Signal, 1)
			signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
			defer close(quit)

			// Init viper
			v := viper.New()
			v.BindPFlag("api.addr", cmd.Flags().Lookup("addr"))

			// Init config
			cfg, err := config.NewConfig(v, cli.Config)
			if err != nil {
				zlog.Fatal().Caller().Err(err).Send()
			}

			// Override params from cli
			for _, param := range params {
				split := strings.SplitN(param, ":", 2)
				if len(split) == 2 {
					v.Set(split[0], split[1])
				}
			}

			// Configure logger
			config.ConfigureLogger(config.LoggerOptions{
				Enabled: cfg.API.Logging.Enabled,
				Level:   cfg.API.Logging.Level,
				Format:  cfg.API.Logging.Format,
			})

			// Init gRPC server
			grpcServer, err := server.NewServer(cfg)
			if err != nil {
				zlog.Fatal().Caller().Err(err).Send()
			}

			// Init health service
			healthServer := health.NewServer()
			grpc_health_v1.RegisterHealthServer(grpcServer, healthServer)
			healthServer.SetServingStatus("", grpc_health_v1.HealthCheckResponse_SERVING)

			// init listener
			lis, err := net.Listen("tcp", cfg.API.Addr)
			if err != nil {
				zlog.Fatal().Caller().Err(err).Send()
			}

			// run server in go routine
			go func() {
				zlog.Info().Msg("Starting kubetail-api on " + cfg.API.Addr)
				if err := grpcServer.Serve(lis); err != nil {
					zlog.Fatal().Caller().Err(err).Send()
				}
			}()

			// Wait for termination signal
			<-quit

			zlog.Info().Msg("Starting graceful shutting...")

			// Graceful shutdown with 30 sec deadline
			// TODO: make timeout configurable
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()

			// start graceful shutdown
			done := make(chan struct{})
			go func() {
				grpcServer.GracefulStop()
				close(done)
			}()

			select {
			case <-done:
				zlog.Info().Msg("Completed graceful shutdown")
			case <-ctx.Done():
				zlog.Error().Msg("Exceeded deadline, shutting down forcefully")
				grpcServer.Stop()
			}
		},
	}

	// Define flags
	flagset := cmd.Flags()
	flagset.SortFlags = false
	flagset.StringVarP(&cli.Config, "config", "c", "", "Path to configuration file (e.g. \"/etc/kubetail/api.yaml\")")
	flagset.StringP("addr", "a", ":50051", "Host address to bind to")
	flagset.StringArrayVarP(&params, "param", "p", []string{}, "Config params")

	// Execute command
	if err := cmd.Execute(); err != nil {
		zlog.Fatal().Caller().Err(err).Send()
	}
}
