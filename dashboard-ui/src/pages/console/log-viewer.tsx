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

import { useVirtualizer } from '@tanstack/react-virtual';
import type { Virtualizer, VirtualItem } from '@tanstack/react-virtual';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';

import { useBeforePaint } from '@/lib/before-paint';
import { DoubleTailedArray } from '@/lib/double-tailed-array';
import { cn } from '@/lib/util';

export type LogRecord = {
  timestamp: number;
  message: string;
};

export type LogViewerInitialPosition =
  | { type: 'head'; timestamp?: never }
  | { type: 'tail'; timestamp?: never }
  | { type: 'time'; timestamp: number };

export type OnChangeCallback<TArgs extends unknown[] = unknown[]> = (...args: TArgs) => void;

export type OnChangeCancelFunction = () => void;

export type LogViewerHandle = {
  isReady: boolean;
  startFollowing: () => Promise<void>;
  stopFollowing: () => void;
  jumpToBeginning: () => Promise<void>;
  jumpToEnd: () => Promise<void>;
  jumpToTime: () => Promise<void>;
  onIsReadyChange: (callback: OnChangeCallback<[boolean]>) => OnChangeCancelFunction;
};

export type LogViewerVirtualRow = {
  key: VirtualItem['key'];
  index: number;
  size: number;
  start: number;
  record: LogRecord;
};

export type LogViewerVirtualizer = {
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  getTotalSize: () => number;
  getVirtualRows: () => LogViewerVirtualRow[];
};

/**
 * LogViewer - Component to render virtualized list of log records
 */

export type LogViewerProps = {
  className?: string;
  style?: React.CSSProperties;
  initialPosition?: LogViewerInitialPosition;
  estimatedSize: number;
  overscan?: number;
  defaultFollow?: boolean;
  children: (virtualizer: LogViewerVirtualizer) => React.ReactNode;
};

const LogViewerInner = ({ className = '', estimatedSize, overscan = 0, children, ...other }: LogViewerProps) => {
  const scrollElementRef = useRef<HTMLDivElement>(null);

  const recordsRef = useRef(new DoubleTailedArray<LogRecord>());

  const [count, setCount] = useState(100);
  const [hasMoreBefore, setHasMoreBefore] = useState(false);
  const [hasMoreAfter, setHasMoreAfter] = useState(false);

  const isInitializedRef = useRef(false);

  const [isInitPending, setIsInitPending] = useState(true);
  const isBeforePendingRef = useRef(false);
  const isAfterPendingRef = useRef(false);
  const [isRefreshPending, setIsRefreshPending] = useState(false);

  const beforePaint = useBeforePaint(count);
  const isAutoScrollEnabledRef = useRef(false);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => estimatedSize,
    overscan,
    scrollMargin: hasMoreBefore ? estimatedSize : 0,
    useScrollendEvent: true,
  });

  const v = useMemo(
    () => ({
      hasMoreBefore,
      hasMoreAfter,
      getTotalSize: () => {
        let size = virtualizer.getTotalSize();
        if (hasMoreBefore) size += estimatedSize;
        if (hasMoreAfter) size += estimatedSize;
        return size;
      },
      getVirtualRows: () =>
        virtualizer.getVirtualItems().map((item) => {
          const { key, index, size, start } = item;
          return {
            key,
            index,
            size,
            start,
            record: { timestamp: 100, message: 'xxx' },
          };
        }),
    }),
    [virtualizer, estimatedSize, hasMoreBefore, hasMoreAfter],
  );

  return (
    <div ref={scrollElementRef} className={cn('overflow-auto', className)}>
      {children(v)}
    </div>
  );
};

export const LogViewer = forwardRef<LogViewerHandle, LogViewerProps>(({ children, ...other }, ref) => {
  const [keyID, setKeyID] = useState(0);

  useImperativeHandle(
    ref,
    () => ({
      isReady: false,
      startFollowing: async () => {
        console.log('startFollowing');
      },
      stopFollowing: () => {
        console.log('stopFollowing');
      },
      jumpToBeginning: async () => {
        setKeyID((id) => id + 1);
      },
      jumpToEnd: async () => {
        setKeyID((id) => id + 1);
      },
      jumpToTime: async () => {
        setKeyID((id) => id + 1);
      },
      onIsReadyChange: (callback: OnChangeCallback<[boolean]>) => () => {},
    }),
    [],
  );

  return (
    <LogViewerInner key={keyID} {...other}>
      {children}
    </LogViewerInner>
  );
});

LogViewer.displayName = 'LogViewer';
