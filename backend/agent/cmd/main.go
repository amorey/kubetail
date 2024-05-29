package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/nats-io/nats.go"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/kubetail-org/kubetail/backend/common/agentpb"
)

// server implements the helloworld.GreeterServer interface.
type server struct{}

// implementation of GetFileInfo in PodLogMetadata service
func (s *server) GetFileInfo(ctx context.Context, req *agentpb.FileInfoRequest) (*agentpb.FileInfoResponse, error) {
	// generate path
	podDirName := fmt.Sprintf("%s_%s_%s", req.Namespace, req.Name, req.Uid)
	podLogPath := filepath.Join("/var/log/pods", podDirName, req.Container, "0.log")
	fmt.Println(podLogPath)
	// get info
	fileInfo, err := os.Stat(podLogPath)
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

func main() {
	fmt.Println("agent2")

	// initialize context and listen for termination signals
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Connect to a nats server
	nc, err := nats.Connect("nats://nats:4222")
	if err != nil {
		panic(err)
	}
	defer nc.Close()

	// init server
	s := &server{}

	// init handler
	h := agentpb.NewPodLogMetadataHandler(ctx, nc, s)

	// subscribe to requests
	subject := strings.Replace(h.Subject(), "*", os.Getenv("NODE_NAME"), 1)
	sub, err := nc.QueueSubscribe(subject, "callonce", h.Handler)
	if err != nil {
		panic(err)
	}
	defer sub.Unsubscribe()

	// wait for context
	<-ctx.Done()
	stop() // stop receiving signals as soon as possible

	fmt.Println("exiting")
}
