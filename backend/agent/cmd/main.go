package main

import (
	"context"
	"fmt"
	"net"
	"os"

	"google.golang.org/grpc"

	"github.com/kubetail-org/kubetail/backend/common/agentpb"
)

// server implements the agentpb.PodLogMetadataServer interface.
type server struct {
	agentpb.UnimplementedLogMetadataServer
	nodeName string
}

// implementation of GetFileInfo in PodLogMetadata service
func (s *server) FileInfoList(ctx context.Context, req *agentpb.FileInfoListRequest) (*agentpb.FileInfoListResponse, error) {
	fmt.Println(s.nodeName)
	/*
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
	*/
	return &agentpb.FileInfoListResponse{}, nil
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
