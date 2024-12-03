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

package logmetadata

import (
	"context"

	"github.com/kubetail-org/kubetail/modules/common/apipb"
)

type LogMetadataService struct {
	apipb.UnimplementedLogMetadataServiceServer
	shutdownCh chan struct{}
}

// Implementation of List() in LogMetadataService
func (s *LogMetadataService) List(ctx context.Context, req *apipb.LogMetadataListRequest) (*apipb.LogMetadataList, error) {
	panic("not implemented")
}

// Implementation of Watch() in LogMetadataService
func (s *LogMetadataService) Watch(req *apipb.LogMetadataWatchRequest, stream apipb.LogMetadataService_WatchServer) error {
	panic("not implemented")
}

// Initiate shutdown
func (s *LogMetadataService) Shutdown() {
	close(s.shutdownCh)
}

// Initialize new instance of LogMetadataService
func NewLogMetadataService() (*LogMetadataService, error) {
	return &LogMetadataService{
		shutdownCh: make(chan struct{}),
	}, nil
}
