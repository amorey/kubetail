package agentpb

//go:generate protoc --proto_path=../../proto --go_out=. --go_opt=paths=source_relative --nrpc_out=. --nrpc_opt=paths=source_relative ../../proto/agent.proto
