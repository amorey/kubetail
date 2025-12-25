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

import { useContext, useRef } from 'react';

import { LogViewer } from './log-viewer';
import { PageContext } from './shared';

const ESTIMATED_SIZE = 24;

/**
 * Main component
 */

export function Main() {
  const { logViewerRef } = useContext(PageContext);

  return (
    <LogViewer ref={logViewerRef} estimatedSize={ESTIMATED_SIZE} defaultFollow>
      {(virtualizer) => (
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
      )}
    </LogViewer>
  );
}
