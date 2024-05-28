package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/nats-io/nats.go"

	agent "github.com/kubetail-org/kubetail/backend/agent/pkg/nrpc"
)

// server implements the helloworld.GreeterServer interface.
type server struct {
	name string
}

// SayHello is an implementation of the SayHello method from the definition of
// the Greeter service.
func (s *server) GetServerName(ctx context.Context, req *agent.ServerRequest) (resp *agent.ServerResponse, err error) {
	fmt.Println(s.name)
	return &agent.ServerResponse{ServerName: s.name}, nil
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

	// Our server implementation.
	s := &server{name: os.Getenv("NODE_NAME")}

	// The NATS handler from the agent.proto file.
	h := agent.NewServerServiceHandler(ctx, nc, s)

	// Start a NATS subscription using the handler. You can also use the
	// QueueSubscribe() method for a load-balanced set of servers.
	//subject := "ServerService.*." + os.Getenv("NODE_NAME")
	sub, err := nc.Subscribe(h.Subject(), h.Handler)
	if err != nil {
		panic(err)
	}
	defer sub.Unsubscribe()

	// wait for context
	<-ctx.Done()
	stop() // stop receiving signals as soon as possible

	fmt.Println("exiting")
}
