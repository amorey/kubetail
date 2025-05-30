//go:build generate
// +build generate

package generate

//go:generate go run github.com/99designs/gqlgen generate
//go:generate swag init -g cmd/main.go
