package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/kubetail-org/kubetail/backend/common/agentpb"
)

// server implements the agentpb.PodLogMetadataServer interface.
type server struct {
	agentpb.UnimplementedPodLogMetadataServer
}

// implementation of FileInfoGet in PodLogMetadata service
func (s *server) FileInfoGet(ctx context.Context, req *agentpb.FileInfoRequest) (*agentpb.FileInfoResponse, error) {
	// generate path
	fileName := fmt.Sprintf("%s_%s_%s-%s.log", req.PodName, req.Namespace, req.ContainerName, req.ContainerId)
	containerLogPath := filepath.Join("/var/log/containers", fileName)

	// get info
	fileInfo, err := os.Stat(containerLogPath)
	if err != nil {
		return nil, err
	}

	// init response
	resp := &agentpb.FileInfoResponse{
		Size:           fileInfo.Size(),
		LastModifiedAt: timestamppb.New(fileInfo.ModTime()),
	}
	return resp, nil
}

// implementation of FileInfoWatch in PodLogMetadata service
func (s *server) FileInfoWatch(req *agentpb.FileInfoRequest, stream agentpb.PodLogMetadata_FileInfoWatchServer) error {
	for i := 0; i < 10; i++ {
		res := &agentpb.FileInfoResponse{Size: int64(i)}
		if err := stream.Send(res); err != nil {
			return err
		}
		time.Sleep(1 * time.Second)
	}
	return nil
	/*
		fmt.Println("starting watcher")

		watcher, err := fsnotify.NewWatcher()
		if err != nil {
			return err
		}
		defer watcher.Close()

		// generate path
		fileName := fmt.Sprintf("%s_%s_%s-%s.log", req.GetPodName(), req.GetNamespace(), req.GetContainerName(), req.GetContainerId())
		containerLogPath := filepath.Join("/var/log/containers", fileName)

		// Add a path.
		err = watcher.Add(containerLogPath)
		if err != nil {
			return err
		}

		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return nil
				}

				if event.Has(fsnotify.Write) {
					resp, err := s.FileInfoGet(ctx, req)
					if err != nil {
						return err
					}
					send(resp)
				}
			case err := <-watcher.Errors:
				if err != nil {
					return err
				}
				return nil
			case <-ctx.Done():
				return nil
			}
		}*/
}

func main() {
	// init service
	s := &server{}

	// init grpc server
	grpcServer := grpc.NewServer()
	agentpb.RegisterPodLogMetadataServer(grpcServer, s)

	// listen
	lis, err := net.Listen("tcp", ":5000")
	if err != nil {
		panic(err)
	}

	// start grpc server
	if err := grpcServer.Serve(lis); err != nil {
		panic(err)
	}
}
