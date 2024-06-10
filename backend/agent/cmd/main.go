package main

import (
	"context"
	"fmt"
	"math/rand"
	"net"
	"os"
	"path"
	"regexp"
	"slices"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/kubetail-org/kubetail/backend/common/agentpb"
)

// Define a regex pattern to match the filename format
var logfileRegex = regexp.MustCompile(`^(?P<PodName>[^_]+)_(?P<Namespace>[^_]+)_(?P<ContainerName>.+)-(?P<ContainerID>[^-]+)\.log$`)

// server implements the agentpb.PodLogMetadataServer interface.
type server struct {
	agentpb.UnimplementedLogMetadataServer
	nodeName string
}

// implementation of FileInfoList in PodLogMetadata service
func (s *server) FileInfoList(ctx context.Context, req *agentpb.FileInfoListRequest) (*agentpb.FileInfoListResponse, error) {
	if len(req.Namespaces) == 0 {
		return nil, fmt.Errorf("non-empty `namespaces` required")
	}

	files, err := os.ReadDir("/var/log/containers")
	if err != nil {
		return nil, err
	}

	items := []*agentpb.FileInfo{}

	for _, file := range files {
		// get info
		fileInfo, err := os.Stat(path.Join("/var/log/containers", file.Name()))
		if err != nil {
			return nil, err
		}

		matches := logfileRegex.FindStringSubmatch(file.Name())
		if matches == nil {
			return nil, fmt.Errorf("filename format incorrect: %s", file.Name())
		}

		// extract vars
		podName := matches[1]
		namespace := matches[2]
		containerName := matches[3]
		containerID := matches[4]

		// skip if namespace not in request args
		if req.Namespaces[0] != "" && !slices.Contains(req.Namespaces, namespace) {
			continue
		}

		// init item
		item := &agentpb.FileInfo{
			Metadata: &agentpb.Metadata{
				NodeName:      s.nodeName,
				Namespace:     namespace,
				PodName:       podName,
				ContainerName: containerName,
				ContainerId:   containerID,
			},
			Size:           fileInfo.Size(),
			LastModifiedAt: timestamppb.New(fileInfo.ModTime()),
		}

		// append to list
		items = append(items, item)
	}

	return &agentpb.FileInfoListResponse{Items: items}, nil
}

// implementation of FileInfoWatch in PodLogMetadata service
func (s *server) FileInfoWatch(req *agentpb.FileInfoWatchRequest, stream agentpb.LogMetadata_FileInfoWatchServer) error {
	ctx := stream.Context()
	ticker := time.NewTicker(500 * time.Millisecond)

	for {
		select {
		case <-ctx.Done():
			fmt.Printf("[%s] client disconnected\n", s.nodeName)
			return nil
		case <-ticker.C:
			ev := agentpb.FileInfoWatchEvent{
				Type: "ADDED",
				Object: &agentpb.FileInfo{
					Metadata: &agentpb.Metadata{
						NodeName: s.nodeName,
					},
					Size: int64(rand.Int()),
				},
			}
			fmt.Println(ev)
			stream.Send(&ev)
		}
	}
}

func main() {
	// init service
	s := &server{nodeName: os.Getenv("NODE_NAME")}

	// init grpc server
	grpcServer := grpc.NewServer()
	agentpb.RegisterLogMetadataServer(grpcServer, s)

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
