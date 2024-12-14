# Kubetail Go Modules

Go workspace that contains the modules used by Kubetail

## Overview

This workspace contains the following modules:

* [agent](agent) - Kubetail Agent
* [api](api) - Kubetail API
* [cli](cli) - Kubetail CLI
* [dashboard](dashboard) - Kubetail Dashboard
* [shared](shared) - Shared libraries

Please view the README in each directory for more details. 

## Run code generators

First install the dependencies:

```console
brew install protobuf protoc-gen-go protoc-gen-go-grpc
```

Next, run the code generators:

```console
go generate github.com/kubetail-org/kubetail/modules/...
```

## Run tests

To run the tests in all the modules:

```console
go test github.com/kubetail-org/kubetail/modules/...
```
