package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/nats-io/nats.go"
)

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

	// async subscriber
	nc.Subscribe("foo", func(m *nats.Msg) {
		fmt.Println(m)
	})

	// wait for context
	<-ctx.Done()
	stop() // stop receiving signals as soon as possible

	fmt.Println("exiting")
}
