# Kubetail Go Modules

Go workspace that contains the modules used by Kubetail

## Overview

This workspace contains the following modules:

* [agent](agent) - Kubetail agent
* [api](api) - Kubetail API server
* [cli](cli) - Kubetail CLI executable
* [dashboard](dashboard) - Kubetail dashboard server
* [shared](shared) - Shared libraries

Please view the README in each directory for more details. 

## Run code generators

To run the code generators in all the modules:

```console
go generate github.com/kubetail-org/kubetail/modules/...
```

## Run tests

To run the tests in all the modules:

```console
go test -race github.com/kubetail-org/kubetail/modules/...
```
