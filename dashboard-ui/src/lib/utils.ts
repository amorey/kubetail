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

/* eslint-disable @typescript-eslint/no-throw-literal */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { joinPaths, getBasename } from '@/lib/helpers';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function readyWaitFetch() {
  const url = new URL(joinPaths(getBasename(), '/api/readywait'), window.location.origin);
  return fetch(url);
}

type SuspenseResource<T> = {
  read: () => T;
};

export function wrapPromise<T>(promise: Promise<T>): SuspenseResource<T> {
  let status = 'pending';
  let response: T;
  let error: Error;

  const suspender = promise.then(
    (res) => {
      status = 'success';
      response = res;
    },
    (err) => {
      status = 'error';
      error = err;
    },
  );

  return {
    read: () => {
      switch (status) {
        case 'pending':
          throw suspender;
        case 'error':
          throw error;
        default:
          return response;
      }
    },
  };
}
