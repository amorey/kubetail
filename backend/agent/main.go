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

	ec, err := nats.NewEncodedConn(nc, nats.JSON_ENCODER)
	if err != nil {
		panic(err)
	}

	type request = interface{}

	sub, err := ec.Subscribe("agent."+os.Getenv("NODE_NAME"), func(subj string, reply string, r *request) {
		fmt.Println(os.Getenv("NODE_NAME"))
		fmt.Println(r)
		ec.Publish(reply, nil)
	})
	if err != nil {
		panic(err)
	}
	defer sub.Unsubscribe()

	// wait for context
	<-ctx.Done()
	stop() // stop receiving signals as soon as possible

	fmt.Println("exiting")
}
