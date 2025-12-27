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

import { format, toZonedTime } from 'date-fns-tz';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { memo, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Spinner } from '@kubetail/ui/elements/spinner';
import { stripAnsi } from 'fancy-ansi';
import { AnsiHtml } from 'fancy-ansi/react';

import { dashboardClient, getClusterAPIClient } from '@/apollo-client';
import { useIsClusterAPIEnabled } from '@/lib/hooks';
import { cn, cssEncode } from '@/lib/util';

// import { FakeClient } from './fake-client';
import { RealClient } from './real-client';
import { LogViewer } from './log-viewer';
import type { LogRecord, LogViewerVirtualRow } from './log-viewer';
import { ALL_VIEWER_COLUMNS, PageContext, ViewerColumn } from './shared';
import { colWidthsAtom, isFollowAtom, isWrapAtom, maxRowWidthAtom, visibleColsAtom } from './state';

const LOG_RECORD_ROW_HEIGHT = 24;
const HAS_MORE_BEFORE_ROW_HEIGHT = 24;
const HAS_MORE_AFTER_ROW_HEIGHT = 24;
const IS_REFRESHING_ROW_HEIGHT = 24;

/**
 * LoadingOverlay component
 */

const LoadingOverlay = () => (
  <div className="bg-chrome-100 opacity-85 w-full h-full flex items-center justify-center">
    <div className="bg-background flex items-center space-x-4 p-3 border border-chrome-200 rounded-md">
      <div>Loading</div>
      <Spinner size="xs" />
    </div>
  </div>
);

/**
 * Row component
 */

const getAttribute = (record: LogRecord, col: ViewerColumn) => {
  switch (col) {
    case ViewerColumn.Timestamp: {
      const tsWithTZ = toZonedTime(record.timestamp, 'UTC');
      return format(tsWithTZ, 'LLL dd, y HH:mm:ss.SSS', { timeZone: 'UTC' });
    }
    case ViewerColumn.ColorDot: {
      const k = cssEncode(`${record.source.namespace}/${record.source.podName}/${record.source.containerName}`);
      const el = <div className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: `var(--${k}-color)` }} />;
      return el;
    }
    case ViewerColumn.PodContainer:
      return `${record.source.podName}/${record.source.containerName}`;
    case ViewerColumn.Region:
      return record.source.metadata.region;
    case ViewerColumn.Zone:
      return record.source.metadata.zone;
    case ViewerColumn.OS:
      return record.source.metadata.os;
    case ViewerColumn.Arch:
      return record.source.metadata.arch;
    case ViewerColumn.Node:
      return record.source.metadata.node;
    case ViewerColumn.Message:
      return <AnsiHtml text={record.message} />;
    default:
      throw new Error('not implemented');
  }
};

type RowProps = {
  row: LogViewerVirtualRow;
};

const Row = memo(({ row }: RowProps) => {
  const visibleCols = useAtomValue(visibleColsAtom);
  const isWrap = useAtomValue(isWrapAtom);

  const rowElRef = useRef<HTMLDivElement>(null);
  const [colWidths, setColWidths] = useAtom(colWidthsAtom);
  const setMaxRowWidth = useSetAtom(maxRowWidthAtom);

  // update global colWidths
  useEffect(() => {
    const rowEl = rowElRef.current;
    if (!rowEl) return;

    // get current column widths
    const currColWidths = new Map<ViewerColumn, number>();
    Array.from(rowEl.children || []).forEach((colEl) => {
      const colId = (colEl as HTMLElement).dataset.colId as ViewerColumn;
      if (!colId || colId === ViewerColumn.Message) return;
      currColWidths.set(colId, colEl.scrollWidth);
    });

    // update colWidths state (if necessary)
    setColWidths((oldVals) => {
      const changedVals = new Map<ViewerColumn, number>();
      currColWidths.forEach((currWidth, colId) => {
        const oldWidth = oldVals.get(colId);
        const newWidth = Math.max(currWidth, oldWidth || 0);
        if (newWidth !== oldWidth) changedVals.set(colId, newWidth);
      });
      if (changedVals.size) return new Map([...oldVals, ...changedVals]);
      return oldVals;
    });

    // update maxRowWidth state
    setMaxRowWidth((currVal) => Math.max(currVal, rowEl.scrollWidth));
  }, [visibleCols, setColWidths, setMaxRowWidth]);

  const els: React.ReactElement[] = [];
  ALL_VIEWER_COLUMNS.forEach((col) => {
    if (visibleCols.has(col)) {
      els.push(
        <div
          key={col}
          className={cn(
            row.index % 2 !== 0 && 'bg-chrome-100',
            'px-2',
            isWrap ? '' : 'whitespace-nowrap',
            col === ViewerColumn.Timestamp ? 'bg-chrome-200' : '',
            col === ViewerColumn.Message ? 'grow' : 'shrink-0',
          )}
          style={col !== ViewerColumn.Message ? { minWidth: `${colWidths.get(col) || 0}px` } : {}}
          data-col-id={col}
        >
          {getAttribute(row.record, col)}
        </div>,
      );
    }
  });

  return (
    <div
      ref={rowElRef}
      className="absolute top-0 left-0 flex leading-6"
      style={{
        height: `${row.size}px`,
        lineHeight: `${LOG_RECORD_ROW_HEIGHT}px`,
        transform: `translateY(${row.start}px)`,
      }}
    >
      {els}
    </div>
  );
});

/**
 * Main component
 */

export function Main() {
  const { logViewerRef } = useContext(PageContext);

  const isFollow = useAtomValue(isFollowAtom);
  const isWrap = useAtomValue(isWrapAtom);

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

  const client = useMemo(() => new RealClient(apolloClient), [apolloClient]);
  // const client = useMemo(() => new FakeClient(1000), [apolloClient]);
  // client.setAppendRate(1);

  const sizerElRef = useRef<HTMLDivElement>(null);

  const estimateRowHeight = useCallback(
    (record: LogRecord) => {
      const sizerEl = sizerElRef.current;
      if (!isWrap || !sizerEl) return LOG_RECORD_ROW_HEIGHT;

      // Strip out ansi
      sizerEl.textContent = stripAnsi(record.message);
      return sizerEl.clientHeight;
    },
    [isWrap],
  );

  return (
    <>
      <LogViewer
        ref={logViewerRef}
        className="h-full w-full"
        client={client}
        estimateRowHeight={estimateRowHeight}
        follow={isFollow}
        hasMoreBeforeRowHeight={HAS_MORE_BEFORE_ROW_HEIGHT}
        hasMoreAfterRowHeight={HAS_MORE_AFTER_ROW_HEIGHT}
        isRefreshingRowHeight={IS_REFRESHING_ROW_HEIGHT}
      >
        {(virtualizer) => (
          <>
            {virtualizer.isLoading && <LoadingOverlay />}
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
              {virtualizer.getVirtualRows().map((virtualRow) => (
                <Row key={virtualRow.key} row={virtualRow} />
              ))}
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
      <div ref={sizerElRef} className="absolute invisible font-mono leading-6 px-2" style={{ width: 300 }} />
    </>
  );
}
