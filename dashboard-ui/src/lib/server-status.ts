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

import { useSubscription } from '@apollo/client';
import { useEffect, useState } from 'react';

import { wsClient1 } from '@/apollo-client';
import * as ops from '@/lib/graphql/ops';
import { HealthCheckStatus, type HealthCheckResponse } from '@/lib/graphql/__generated__/graphql';

export const enum Status {
  Healthy = 'HEALTHY',
  Unhealthy = 'UNHEALTHY',
  Unknown = 'UNKNOWN',
  NotFound = 'NOTFOUND',
}

export class ServerStatus {
  public status: Status = Status.Unknown;

  public message: string | null = null;

  public lastUpdatedAt: Date | null = null;

  public constructor(init?: Partial<ServerStatus>) {
    Object.assign(this, init);
  }

  static fromK8sHealthCheck(healthCheck: HealthCheckResponse | undefined) {
    const ss = new ServerStatus({
      message: healthCheck?.message || null,
      lastUpdatedAt: healthCheck?.timestamp || null,
    });

    switch (healthCheck?.status) {
      case HealthCheckStatus.Success:
        ss.status = Status.Healthy;
        break;
      case HealthCheckStatus.Notfound:
        ss.status = Status.NotFound;
        break;
      default:
        ss.status = Status.Unhealthy;
    }

    return ss;
  }
}

export function useServerStatus() {
  const [backendStatus, setBackendStatus] = useState<ServerStatus>(new ServerStatus());
  const [apiStatus, setAPIStatus] = useState<ServerStatus>(new ServerStatus());
  const [k8sLivezStatus, setK8sLivezStatus] = useState<ServerStatus>(new ServerStatus());
  const [k8sReadyzStatus, setK8sReadyzStatus] = useState<ServerStatus>(new ServerStatus());

  useSubscription(ops.API_HEALTHZ_WATCH, {
    onData: ({ data }) => setAPIStatus(ServerStatus.fromK8sHealthCheck(data.data?.apiHealthzWatch)),
  });

  useSubscription(ops.LIVEZ_WATCH, {
    onData: ({ data }) => setK8sLivezStatus(ServerStatus.fromK8sHealthCheck(data.data?.livezWatch)),
  });

  useSubscription(ops.READYZ_WATCH, {
    onData: ({ data }) => setK8sReadyzStatus(ServerStatus.fromK8sHealthCheck(data.data?.readyzWatch)),
  });

  useEffect(() => {
    const fns = [
      wsClient1.on('connected', () => {
        setBackendStatus(new ServerStatus({ status: Status.Healthy, lastUpdatedAt: new Date() }));
      }),
      wsClient1.on('pong', () => {
        setBackendStatus(new ServerStatus({ status: Status.Healthy, lastUpdatedAt: new Date() }));
      }),
      wsClient1.on('closed', () => {
        const status = new ServerStatus({ status: Status.Unhealthy, lastUpdatedAt: new Date() });
        status.message = 'Unable to connect';
        setBackendStatus(status);
        setK8sLivezStatus(new ServerStatus());
        setK8sReadyzStatus(new ServerStatus());
      }),
      wsClient1.on('error', () => {
        const status = new ServerStatus({ status: Status.Unhealthy, lastUpdatedAt: new Date() });
        status.message = 'Error while establishing connection';
        setBackendStatus(status);
        setK8sLivezStatus(new ServerStatus());
        setK8sReadyzStatus(new ServerStatus());
      }),
    ];

    // cleanup
    return () => fns.forEach((fn) => fn());
  }, []);

  const all = [backendStatus, apiStatus, k8sLivezStatus, k8sReadyzStatus];

  let status = Status.Unknown;
  if (all.every((item) => item.status === Status.Healthy)) status = Status.Healthy;
  else if (all.some((item) => item.status === Status.Unhealthy)) status = Status.Unhealthy;

  return {
    status,
    details: {
      backendServer: backendStatus,
      kubetailAPI: apiStatus,
      k8sLivez: k8sLivezStatus,
      k8sReadyz: k8sReadyzStatus,
    },
  };
}
