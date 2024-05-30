package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/fsnotify/fsnotify"
	"github.com/nats-io/nats.go"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/kubetail-org/kubetail/backend/common/agentpb"
)

// server implements the agentpb.PodLogMetadataServer interface.
type server struct{}

// implementation of GetFileInfo in PodLogMetadata service
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
func (s *server) FileInfoWatch(ctx context.Context, req *agentpb.FileInfoRequest, send func(*agentpb.FileInfoResponse)) error {
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
	}
}

func main() {
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
}
