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

import { useContext, useMemo, useRef } from 'react';

import { FakeClient } from './fake-client';
import { LogViewer } from './log-viewer';
import { PageContext } from './shared';

const ESTIMATED_SIZE = 24;

/**
 * Main component
 */

export function Main() {
  const { logViewerRef } = useContext(PageContext);

  const client = useMemo(() => new FakeClient(1000), []);

  return (
    <LogViewer
      ref={logViewerRef}
      className="h-full w-full"
      client={client}
      estimatedSize={ESTIMATED_SIZE}
      defaultFollow
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
            {virtualizer.hasMoreBefore && <div>Has more before</div>}
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
                  {record.timestamp} {record.message}
                </div>
              );
            })}
            {virtualizer.hasMoreBefore && <div>Has more after</div>}
          </div>
        </>
      )}
    </LogViewer>
  );
}
