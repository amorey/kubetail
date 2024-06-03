module github.com/kubetail-org/kubetail/backend/agent

go 1.22.3

replace github.com/kubetail-org/kubetail/backend/common => ../common

require (
	github.com/kubetail-org/kubetail/backend/common v0.0.0-00010101000000-000000000000
	google.golang.org/grpc v1.31.0
)

require (
	github.com/golang/protobuf v1.5.3 // indirect
	golang.org/x/net v0.10.0 // indirect
	golang.org/x/sys v0.16.0 // indirect
	golang.org/x/text v0.14.0 // indirect
	google.golang.org/genproto v0.0.0-20200825200019-8632dd797987 // indirect
	google.golang.org/protobuf v1.34.1 // indirect
)
