// Copyright 2024-2025 Andres Morey
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

import { useCallback, useContext, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { dashboardClient, getClusterAPIClient } from '@/apollo-client';
import { useIsClusterAPIEnabled } from '@/lib/hooks';

import { FakeClient } from './fake-client';
// import { RealClient } from './real-client';
import { LogViewer } from './log-viewer';
import type { LogRecord } from './log-viewer';
import { PageContext } from './shared';

const LOG_RECORD_ROW_HEIGHT = 24;
const HAS_MORE_BEFORE_ROW_HEIGHT = 24;
const HAS_MORE_AFTER_ROW_HEIGHT = 24;
const IS_REFRESHING_ROW_HEIGHT = 24;

/**
 * Main component
 */

export function Main() {
  const { follow, logViewerRef } = useContext(PageContext);

  const [searchParams] = useSearchParams();
  const kubeContext = searchParams.get('kubeContext') || '';

  const isUseClusterAPIEnabled = useIsClusterAPIEnabled(kubeContext);

  const apolloClient = useMemo(() => {
    if (!isUseClusterAPIEnabled) return dashboardClient;
    return getClusterAPIClient({
      kubeContext,
      namespace: 'kubetail-system',
      serviceName: 'kubetail-cluster-api',
    });
  }, [isUseClusterAPIEnabled, kubeContext]);

  // const client = useMemo(() => new RealClient(apolloClient), [apolloClient]);
  const client = useMemo(() => new FakeClient(1000), [apolloClient]);
  client.setAppendRate(1);

  const estimateRowHeight = useCallback((record: LogRecord) => LOG_RECORD_ROW_HEIGHT, []);

  return (
    <LogViewer
      ref={logViewerRef}
      className="h-full w-full"
      client={client}
      estimateRowHeight={estimateRowHeight}
      follow={follow}
      hasMoreBeforeRowHeight={HAS_MORE_BEFORE_ROW_HEIGHT}
      hasMoreAfterRowHeight={HAS_MORE_AFTER_ROW_HEIGHT}
      isRefreshingRowHeight={IS_REFRESHING_ROW_HEIGHT}
    >
      {(virtualizer) => (
        <>
          {virtualizer.isLoading && (
            <div className="absolute inset-0 bg-white/65 flex items-center justify-center z-10">
              <div className="bg-white px-6 py-4 rounded shadow-lg flex items-center space-x-3">
                <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                <span className="text-gray-700 font-medium">Loading...</span>
              </div>
            </div>
          )}
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.hasMoreBefore && (
              <div
                className="absolute top-0 left-0 w-full border-b border-gray-300 font-mono text-gray-500"
                style={{
                  height: `${virtualizer.hasMoreBeforeRowHeight}px`,
                  lineHeight: `${virtualizer.hasMoreBeforeRowHeight}px`,
                }}
              >
                Loading...
              </div>
            )}
            {virtualizer.getVirtualRows().map((virtualRow) => {
              const { record } = virtualRow;
              return (
                <div
                  key={virtualRow.key}
                  className="absolute top-0 left-0 w-full border-b border-gray-300 font-mono"
                  style={{
                    height: `${virtualRow.size}px`,
                    lineHeight: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {record.timestamp.toISOString()} {record.message}
                </div>
              );
            })}
            {virtualizer.hasMoreAfter && (
              <div
                className="absolute bottom-0 left-0 w-full border-b border-gray-300 font-mono text-gray-500"
                style={{
                  height: `${virtualizer.hasMoreAfterRowHeight}px`,
                  lineHeight: `${virtualizer.hasMoreAfterRowHeight}px`,
                }}
              >
                Loading...
              </div>
            )}
            {virtualizer.isRefreshing && (
              <div
                className="absolute bottom-0 left-0 w-full border-b border-gray-300 font-mono text-gray-500"
                style={{
                  height: `${virtualizer.isRefreshingRowHeight}px`,
                  lineHeight: `${virtualizer.isRefreshingRowHeight}px`,
                }}
              >
                Refreshing...
              </div>
            )}
          </div>
        </>
      )}
    </LogViewer>
  );
}
