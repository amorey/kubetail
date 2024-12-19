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

package app

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type app struct {
	*gin.Engine
	shutdownCh chan struct{}
}

// Shutdown
func (a *app) Shutdown() {
	// Send shutdown signal to internal processes
	if a.shutdownCh != nil {
		close(a.shutdownCh)
	}
}

// Create new gin app
func NewApp() (*app, error) {
	// Init app
	app := &app{
		Engine:     gin.New(),
		shutdownCh: make(chan struct{}),
	}

	app.GET("/", func(c *gin.Context) {
		c.String(http.StatusOK, "hello")
	})

	return app, nil
}
