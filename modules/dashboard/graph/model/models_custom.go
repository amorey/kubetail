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

package model

import (
	"encoding/json"
	"io"

	"github.com/99designs/gqlgen/graphql"
	zlog "github.com/rs/zerolog/log"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/kubetail-org/kubetail/modules/shared/graphql/errors"
)

type List interface{}

type Object interface{}

// StringMap scalar
func MarshalStringMap(val map[string]string) graphql.Marshaler {
	return graphql.WriterFunc(func(w io.Writer) {
		err := json.NewEncoder(w).Encode(val)
		if err != nil {
			zlog.Fatal().Err(err).Send()
		}
	})
}

func UnmarshalStringMap(v interface{}) (map[string]string, error) {
	if m, ok := v.(map[string]string); ok {
		return m, nil
	}
	return nil, errors.NewValidationError("stringmap", "Expected json-encoded string representing map[string]string")
}

// MetaV1Time scalar
func MarshalMetaV1Time(t metav1.Time) graphql.Marshaler {
	if t.IsZero() {
		return graphql.Null
	}

	return graphql.WriterFunc(func(w io.Writer) {
		b, _ := t.MarshalJSON()
		w.Write(b)
	})
}

func UnmarshalMetaV1Time(v interface{}) (metav1.Time, error) {
	var t metav1.Time
	if tmpStr, ok := v.(string); ok {
		err := t.UnmarshalQueryParameter(tmpStr)
		return t, err
	}
	return t, errors.NewValidationError("metav1time", "Expected RFC3339 formatted string")
}
