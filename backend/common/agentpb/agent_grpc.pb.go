// Copyright 2024 Andres Morey
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Code generated by protoc-gen-go-grpc. DO NOT EDIT.
// versions:
// - protoc-gen-go-grpc v1.4.0
// - protoc             v5.27.3
// source: agent.proto

package agentpb

import (
	context "context"
	grpc "google.golang.org/grpc"
	codes "google.golang.org/grpc/codes"
	status "google.golang.org/grpc/status"
)

// This is a compile-time assertion to ensure that this generated file
// is compatible with the grpc package it is being compiled against.
// Requires gRPC-Go v1.62.0 or later.
const _ = grpc.SupportPackageIsVersion8

const (
	LogMetadataService_List_FullMethodName  = "/agentpb.LogMetadataService/List"
	LogMetadataService_Watch_FullMethodName = "/agentpb.LogMetadataService/Watch"
)

// LogMetadataServiceClient is the client API for LogMetadataService service.
//
// For semantics around ctx use and closing/ending streaming RPCs, please refer to https://pkg.go.dev/google.golang.org/grpc/?tab=doc#ClientConn.NewStream.
type LogMetadataServiceClient interface {
	List(ctx context.Context, in *LogMetadataListRequest, opts ...grpc.CallOption) (*LogMetadataList, error)
	Watch(ctx context.Context, in *LogMetadataWatchRequest, opts ...grpc.CallOption) (LogMetadataService_WatchClient, error)
}

type logMetadataServiceClient struct {
	cc grpc.ClientConnInterface
}

func NewLogMetadataServiceClient(cc grpc.ClientConnInterface) LogMetadataServiceClient {
	return &logMetadataServiceClient{cc}
}

func (c *logMetadataServiceClient) List(ctx context.Context, in *LogMetadataListRequest, opts ...grpc.CallOption) (*LogMetadataList, error) {
	cOpts := append([]grpc.CallOption{grpc.StaticMethod()}, opts...)
	out := new(LogMetadataList)
	err := c.cc.Invoke(ctx, LogMetadataService_List_FullMethodName, in, out, cOpts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *logMetadataServiceClient) Watch(ctx context.Context, in *LogMetadataWatchRequest, opts ...grpc.CallOption) (LogMetadataService_WatchClient, error) {
	cOpts := append([]grpc.CallOption{grpc.StaticMethod()}, opts...)
	stream, err := c.cc.NewStream(ctx, &LogMetadataService_ServiceDesc.Streams[0], LogMetadataService_Watch_FullMethodName, cOpts...)
	if err != nil {
		return nil, err
	}
	x := &logMetadataServiceWatchClient{ClientStream: stream}
	if err := x.ClientStream.SendMsg(in); err != nil {
		return nil, err
	}
	if err := x.ClientStream.CloseSend(); err != nil {
		return nil, err
	}
	return x, nil
}

type LogMetadataService_WatchClient interface {
	Recv() (*LogMetadataWatchEvent, error)
	grpc.ClientStream
}

type logMetadataServiceWatchClient struct {
	grpc.ClientStream
}

func (x *logMetadataServiceWatchClient) Recv() (*LogMetadataWatchEvent, error) {
	m := new(LogMetadataWatchEvent)
	if err := x.ClientStream.RecvMsg(m); err != nil {
		return nil, err
	}
	return m, nil
}

// LogMetadataServiceServer is the server API for LogMetadataService service.
// All implementations must embed UnimplementedLogMetadataServiceServer
// for forward compatibility
type LogMetadataServiceServer interface {
	List(context.Context, *LogMetadataListRequest) (*LogMetadataList, error)
	Watch(*LogMetadataWatchRequest, LogMetadataService_WatchServer) error
	mustEmbedUnimplementedLogMetadataServiceServer()
}

// UnimplementedLogMetadataServiceServer must be embedded to have forward compatible implementations.
type UnimplementedLogMetadataServiceServer struct {
}

func (UnimplementedLogMetadataServiceServer) List(context.Context, *LogMetadataListRequest) (*LogMetadataList, error) {
	return nil, status.Errorf(codes.Unimplemented, "method List not implemented")
}
func (UnimplementedLogMetadataServiceServer) Watch(*LogMetadataWatchRequest, LogMetadataService_WatchServer) error {
	return status.Errorf(codes.Unimplemented, "method Watch not implemented")
}
func (UnimplementedLogMetadataServiceServer) mustEmbedUnimplementedLogMetadataServiceServer() {}

// UnsafeLogMetadataServiceServer may be embedded to opt out of forward compatibility for this service.
// Use of this interface is not recommended, as added methods to LogMetadataServiceServer will
// result in compilation errors.
type UnsafeLogMetadataServiceServer interface {
	mustEmbedUnimplementedLogMetadataServiceServer()
}

func RegisterLogMetadataServiceServer(s grpc.ServiceRegistrar, srv LogMetadataServiceServer) {
	s.RegisterService(&LogMetadataService_ServiceDesc, srv)
}

func _LogMetadataService_List_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(LogMetadataListRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(LogMetadataServiceServer).List(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: LogMetadataService_List_FullMethodName,
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(LogMetadataServiceServer).List(ctx, req.(*LogMetadataListRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _LogMetadataService_Watch_Handler(srv interface{}, stream grpc.ServerStream) error {
	m := new(LogMetadataWatchRequest)
	if err := stream.RecvMsg(m); err != nil {
		return err
	}
	return srv.(LogMetadataServiceServer).Watch(m, &logMetadataServiceWatchServer{ServerStream: stream})
}

type LogMetadataService_WatchServer interface {
	Send(*LogMetadataWatchEvent) error
	grpc.ServerStream
}

type logMetadataServiceWatchServer struct {
	grpc.ServerStream
}

func (x *logMetadataServiceWatchServer) Send(m *LogMetadataWatchEvent) error {
	return x.ServerStream.SendMsg(m)
}

// LogMetadataService_ServiceDesc is the grpc.ServiceDesc for LogMetadataService service.
// It's only intended for direct use with grpc.RegisterService,
// and not to be introspected or modified (even as a copy)
var LogMetadataService_ServiceDesc = grpc.ServiceDesc{
	ServiceName: "agentpb.LogMetadataService",
	HandlerType: (*LogMetadataServiceServer)(nil),
	Methods: []grpc.MethodDesc{
		{
			MethodName: "List",
			Handler:    _LogMetadataService_List_Handler,
		},
	},
	Streams: []grpc.StreamDesc{
		{
			StreamName:    "Watch",
			Handler:       _LogMetadataService_Watch_Handler,
			ServerStreams: true,
		},
	},
	Metadata: "agent.proto",
}
