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

/* eslint-disable no-param-reassign */

import { useVirtualizer } from '@tanstack/react-virtual';
import type { Virtualizer, VirtualItem } from '@tanstack/react-virtual';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

import { useBeforePaint, type BeforePaintSubscribe } from '@/lib/before-paint';
import { DoubleTailedArray } from '@/lib/double-tailed-array';
import { cn } from '@/lib/util';

export type LogRecord = {
  timestamp: number;
  message: string;
};

export type FetchResult = {
  records: LogRecord[];
};

export type SubscriptionCallback = (record: LogRecord) => void;

export type SubscriptionOptions = {
  after?: number;
};

export type SubscriptionCancelFunction = () => void;

export type Client = {
  fetchSince: (ts: number, count: number) => Promise<FetchResult>;
  fetchUntil: (ts: number, count: number) => Promise<FetchResult>;
  fetchAfter: (ts: number, count: number) => Promise<FetchResult>;
  fetchBefore: (ts: number, count: number) => Promise<FetchResult>;
  subscribe: (callback: SubscriptionCallback, options?: SubscriptionOptions) => SubscriptionCancelFunction;
};

export type LogViewerInitialPosition =
  | { type: 'head'; timestamp?: never }
  | { type: 'tail'; timestamp?: never }
  | { type: 'time'; timestamp: number };

export type OnChangeCallback<TArgs extends unknown[] = unknown[]> = (...args: TArgs) => void;

export type OnChangeCancelFunction = () => void;

export type LogViewerHandle = {
  readonly isLoading: boolean;
  readonly isLoadingBefore: boolean;
  readonly isLoadingAfter: boolean;
  readonly isRefreshing: boolean;
  startFollowing: () => Promise<void>;
  stopFollowing: () => void;
  jumpToBeginning: () => Promise<void>;
  jumpToEnd: () => Promise<void>;
  jumpToTime: () => Promise<void>;
  onChange: (name: string, callback: OnChangeCallback<[boolean]>) => OnChangeCancelFunction;
};

export type LogViewerVirtualRow = {
  key: VirtualItem['key'];
  index: number;
  size: number;
  start: number;
  record: LogRecord;
};

export type LogViewerVirtualizer = {
  readonly isLoading: boolean;
  readonly isLoadingBefore: boolean;
  readonly isLoadingAfter: boolean;
  readonly isRefreshing: boolean;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  hasMoreAfterStart: number;
  getTotalSize: () => number;
  getVirtualRows: () => LogViewerVirtualRow[];
};

type LogViewerRuntimeConfig = {
  readonly initialPosition: LogViewerInitialPosition;
  readonly follow: boolean;
  readonly overscan: number;
  readonly batchSizeInitial: number;
  readonly batchSizeRegular: number;
  readonly loadMoreThreshold: number;
  readonly pinToBottomTolerance: number;
  readonly estimatedSize: number;
};

type LogViewerRuntimeState = {
  readonly count: number;
  readonly hasMoreBefore: boolean;
  readonly hasMoreAfter: boolean;
  readonly isLoading: boolean;
};

type LogViewerRuntimeRefs = {
  records: React.RefObject<DoubleTailedArray<LogRecord>>;
  scrollEl: React.RefObject<HTMLDivElement | null>;
  isAutoScrollEnabled: React.RefObject<boolean>;
  isLoadingBefore: React.RefObject<boolean>;
  isLoadingAfter: React.RefObject<boolean>;
  isRefreshing: React.RefObject<boolean>;
};

type LogViewerRuntimeActions = {
  setCount: React.Dispatch<React.SetStateAction<number>>;
  setHasMoreBefore: React.Dispatch<React.SetStateAction<boolean>>;
  setHasMoreAfter: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
};

type LogViewerRuntime = {
  client: Client;
  config: LogViewerRuntimeConfig;
  state: LogViewerRuntimeState;
  refs: LogViewerRuntimeRefs;
  actions: LogViewerRuntimeActions;
  services: {
    virtualizer: Virtualizer<HTMLDivElement, Element>;
    beforePaint: BeforePaintSubscribe;
  };
};

/**
 * useInit - Initializer hook
 */

const useInit = ({ client, config, refs, actions, services }: LogViewerRuntime) => {
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const initFn = async () => {
      switch (config.initialPosition.type) {
        case 'head': {
          const result = await client.fetchSince(0, config.batchSizeInitial + 1);

          // Update UI
          if (result.records.length) {
            if (result.records.length > config.batchSizeInitial) {
              result.records.pop();
              actions.setHasMoreAfter(true);
            }

            refs.records.current = new DoubleTailedArray(result.records);
            actions.setCount(result.records.length);
          }

          break;
        }
        case 'tail': {
          const result = await client.fetchUntil(Infinity, config.batchSizeInitial + 1);

          // Update UI
          if (result.records.length) {
            if (result.records.length > config.batchSizeInitial) {
              result.records.shift();
              actions.setHasMoreBefore(true);
            }

            const beforePaintPromise = services.beforePaint(() => {
              const scrollElement = refs.scrollEl.current;
              if (scrollElement) scrollElement.scrollTop = scrollElement.scrollHeight;
            });

            refs.records.current = new DoubleTailedArray(result.records);
            actions.setCount(result.records.length);

            await beforePaintPromise;
          }

          if (config.follow) refs.isAutoScrollEnabled.current = true;

          break;
        }
        case 'time': {
          // Fetch BATCH_SIZE records before and after the seek timestamp
          const [beforeResult, afterResult] = await Promise.all([
            client.fetchBefore(config.initialPosition.timestamp, config.batchSizeInitial + 1),
            client.fetchSince(config.initialPosition.timestamp, config.batchSizeInitial + 1),
          ]);

          // Update UI
          if (beforeResult.records.length || afterResult.records.length) {
            // Handle cursors for before results
            if (beforeResult.records.length > config.batchSizeInitial) {
              beforeResult.records.shift();
              actions.setHasMoreBefore(true);
            }

            // Handle cursors for after results
            if (afterResult.records.length > config.batchSizeInitial) {
              afterResult.records.pop();
              actions.setHasMoreAfter(true);
            }

            // Scroll to the middle (where the seek timestamp should be)
            const beforePaintPromise = services.beforePaint(() => {
              services.virtualizer.scrollToIndex(beforeResult.records.length, { align: 'start' });
            });

            // Combine results
            const allRecords = new DoubleTailedArray(afterResult.records);
            allRecords.prepend(...beforeResult.records);
            refs.records.current = allRecords;
            actions.setCount(allRecords.length);

            await beforePaintPromise;
          }

          break;
        }
        default:
          throw new Error('Invalid initial position type');
      }
    };

    // Call init function
    let cancelID: number;

    actions.setIsLoading(true);

    initFn()
      .catch((error) => {
        // Log error but don't throw - allow the UI to continue functioning
        console.error('Failed to load records:', error);
      })
      .finally(() => {
        // Wait until paint finishes to turn off loading flag
        cancelID = requestAnimationFrame(() => actions.setIsLoading(false));
      });

    return () => {
      if (cancelID) cancelAnimationFrame(cancelID);
    };
  }, [client]);
};

/**
 * useLoadMoreBefore - Returns stable loadMoreBefore function
 */

const useLoadMoreBefore = ({ client, config, refs, actions, services }: LogViewerRuntime) =>
  useCallback(async () => {
    // Get data
    const records = refs.records.current;
    const result = await client.fetchBefore(records.first().timestamp, config.batchSizeRegular + 1);

    // Update `hasMoreBefore`
    if (result.records.length > config.batchSizeRegular) result.records.shift();
    else actions.setHasMoreBefore(false);

    // Update UI
    if (result.records.length) {
      const scrollElement = refs.scrollEl.current;
      if (!scrollElement) return;

      const { scrollTop: prevScrollTop, scrollHeight: prevScrollHeight } = scrollElement;

      // Hack to get around https://github.com/TanStack/virtual/issues/1094
      services.virtualizer.isScrolling = false;

      const beforePaintPromise = services.beforePaint(() => {
        const nextScrollHeight = scrollElement.scrollHeight;
        scrollElement.scrollTop = prevScrollTop + (nextScrollHeight - prevScrollHeight);
      });

      records.prepend(...result.records);
      actions.setCount(records.length);

      await beforePaintPromise;
    }
  }, [client, config.batchSizeRegular]);

/**
 * useLoadMoreAfter - Returns stable loadMoreAfter function
 */

const useLoadMoreAfter = ({ client, config, refs, actions, services }: LogViewerRuntime) =>
  useCallback(async () => {
    // Get data
    const records = refs.records.current;
    const result = await client.fetchAfter(records.last().timestamp, config.batchSizeRegular + 1);

    // Update `hasMoreAfter`
    if (result.records.length > config.batchSizeRegular) result.records.pop();
    else actions.setHasMoreAfter(false);

    // Update UI
    if (result.records.length) {
      // Hack to get around https://github.com/TanStack/virtual/issues/1094
      services.virtualizer.isScrolling = false;

      records.append(...result.records);
      actions.setCount(records.length);
    }
  }, [client, config.batchSizeRegular]);

/**
 * useLoadMore - Load more hook
 */

const useLoadMore = (runtime: LogViewerRuntime) => {
  const loadMoreBefore = useLoadMoreBefore(runtime);
  const loadMoreAfter = useLoadMoreAfter(runtime);

  const { config, refs, state, services } = runtime;

  const virtualItems = services.virtualizer.getVirtualItems();

  useEffect(() => {
    if (!virtualItems.length || state.isLoading) return;

    let cancelID1: number;
    let cancelID2: number;

    if (state.hasMoreBefore && !refs.isLoadingBefore.current) {
      const first = virtualItems[0];
      if (first.index <= config.loadMoreThreshold - config.overscan) {
        refs.isLoadingBefore.current = true;
        loadMoreBefore()
          .catch((error) => {
            // Log error but don't throw - allow the UI to continue functioning
            console.error('Failed to load more records before:', error);
          })
          .finally(() => {
            cancelID1 = requestAnimationFrame(() => {
              refs.isLoadingBefore.current = false;
            });
          });
      }
    }

    if (state.hasMoreAfter && !refs.isLoadingAfter.current) {
      const last = virtualItems[virtualItems.length - 1];
      if (last.index >= state.count - 1 - config.loadMoreThreshold + config.overscan) {
        refs.isLoadingAfter.current = true;
        loadMoreAfter()
          .catch((error) => {
            // Log error but don't throw - allow the UI to continue functioning
            console.error('Failed to load more records after:', error);
          })
          .finally(() => {
            cancelID2 = requestAnimationFrame(() => {
              refs.isLoadingAfter.current = false;
            });
          });
      }
    }

    return () => {
      if (cancelID1) cancelAnimationFrame(cancelID1);
      if (cancelID2) cancelAnimationFrame(cancelID2);
    };
  }, [config.overscan, virtualItems, state.count, state.hasMoreBefore, state.hasMoreAfter, state.isLoading]);
};

/**
 * usePullToRefresh
 */

const usePullToRefresh = (runtime: LogViewerRuntime) => {
  const loadMoreAfter = useLoadMoreAfter(runtime);

  const { config, refs, state } = runtime;

  // Handle pull-to-refresh at the end when follow is disabled
  useEffect(() => {
    const scrollElement = refs.scrollEl.current;
    if (!scrollElement) return;

    if (config.follow || state.isLoading || state.hasMoreAfter) return;

    const isAtBottom = () => {
      const { scrollTop, clientHeight, scrollHeight } = scrollElement;
      return Math.abs(scrollTop + clientHeight - scrollHeight) <= config.pinToBottomTolerance;
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY <= 0) return;
      if (!isAtBottom()) return;
      if (refs.isLoadingAfter.current) return;

      refs.isRefreshing.current = true;

      loadMoreAfter()
        .catch((error) => {
          // Log error but don't throw - allow the UI to continue functioning
          console.error('Failed to refresh records:', error);
        })
        .finally(() => {
          requestAnimationFrame(() => {
            refs.isRefreshing.current = false;
          });
        });
    };

    scrollElement.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      scrollElement.removeEventListener('wheel', handleWheel);
    };
  }, [config.follow, config.pinToBottomTolerance, config.loadMoreThreshold, state.isLoading, state.hasMoreAfter]);
};

/**
 * useFollow
 */

const useFollow = ({ client, config, state, refs, actions, services }: LogViewerRuntime) => {
  useEffect(() => {
    if (!config.follow || state.isLoading || state.hasMoreAfter) return;

    const records = refs.records.current;
    const pendingRecords: LogRecord[] = [];
    let rafID: number | null = null;

    const scrollElement = refs.scrollEl.current;

    const flush = async () => {
      if (pendingRecords.length === 0) return;

      // Hack to get around https://github.com/TanStack/virtual/issues/1094
      services.virtualizer.isScrolling = false;

      // Scroll to bottom if auto-scroll enabled
      const beforePaintPromise =
        refs.isAutoScrollEnabled.current &&
        services.beforePaint(() => {
          if (scrollElement) scrollElement.scrollTop = scrollElement.scrollHeight;
        });

      // Append all pending records at once
      records.append(...pendingRecords);
      actions.setCount(records.length);

      // Clear the pending records
      pendingRecords.length = 0;
      rafID = null;

      await beforePaintPromise;
    };

    const cb = (record: LogRecord) => {
      pendingRecords.push(record);

      // Schedule flush if not already scheduled
      if (rafID === null) rafID = requestAnimationFrame(flush);
    };

    const opts = records.length ? { after: records.last().timestamp } : undefined;

    const unsubscribe = client.subscribe(cb, opts);

    return () => {
      if (rafID !== null) cancelAnimationFrame(rafID);

      // Flush any remaining records before cleanup
      flush();
      unsubscribe();
    };
  }, [client, services.virtualizer, config.follow, state.isLoading, state.hasMoreAfter]);
};

/**
 * useAutoScroll
 */

const useAutoScroll = ({ config, state, refs }: LogViewerRuntime) => {
  // Handle auto-scroll detection
  const lastScrollTopRef = useRef(0);

  useEffect(() => {
    const scrollElement = refs.scrollEl.current;
    if (!scrollElement) return;

    if (state.isLoading || state.hasMoreAfter) return;

    const handleScroll = () => {
      const lastScrollTop = lastScrollTopRef.current;

      const { scrollTop, clientHeight, scrollHeight } = scrollElement;

      // Update scroll position tracker
      lastScrollTopRef.current = scrollTop;

      // If scrolling up, turn off auto-scroll and exit
      if (scrollTop < lastScrollTop) {
        refs.isAutoScrollEnabled.current = false;
        return;
      }

      // If scrolled to bottom, turn on auto-scroll
      if (
        !refs.isAutoScrollEnabled.current &&
        Math.abs(scrollTop + clientHeight - scrollHeight) <= config.pinToBottomTolerance
      ) {
        refs.isAutoScrollEnabled.current = true;
      }
    };

    scrollElement.addEventListener('scroll', handleScroll);

    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
    };
  }, [config.pinToBottomTolerance, config.follow, state.isLoading, state.hasMoreAfter]);
};

/**
 * LogViewerInner - Inner component that renders virtualized list of log records
 */

type LogViewerInnerProps = {
  className?: string;
  partialRuntime: {
    client: Client;
    config: LogViewerRuntimeConfig;
    state: Pick<LogViewerRuntimeState, 'isLoading'>;
    refs: Pick<LogViewerRuntimeRefs, 'isLoadingBefore' | 'isLoadingAfter' | 'isRefreshing'>;
    actions: Pick<LogViewerRuntimeActions, 'setIsLoading'>;
  };
  children: (virtualizer: LogViewerVirtualizer) => React.ReactNode;
};

const LogViewerInner = ({ className = '', partialRuntime, children, ...other }: LogViewerInnerProps) => {
  const scrollElementRef = useRef<HTMLDivElement>(null);

  const recordsRef = useRef(new DoubleTailedArray<LogRecord>());

  const [count, setCount] = useState(0);
  const [hasMoreBefore, setHasMoreBefore] = useState(false);
  const [hasMoreAfter, setHasMoreAfter] = useState(false);

  const beforePaint = useBeforePaint(count);
  const isAutoScrollEnabledRef = useRef(false);

  const { config } = partialRuntime;

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => config.estimatedSize,
    overscan: config.overscan,
    scrollMargin: hasMoreBefore ? config.estimatedSize : 0,
    useScrollendEvent: true,
  });

  const runtime = {
    client: partialRuntime.client,
    config: partialRuntime.config,
    state: { count, hasMoreBefore, hasMoreAfter, ...partialRuntime.state },
    refs: {
      records: recordsRef,
      scrollEl: scrollElementRef,
      isAutoScrollEnabled: isAutoScrollEnabledRef,
      ...partialRuntime.refs,
    },
    actions: { setCount, setHasMoreBefore, setHasMoreAfter, ...partialRuntime.actions },
    services: { virtualizer, beforePaint },
  } satisfies LogViewerRuntime;

  useInit(runtime);
  useLoadMore(runtime);
  usePullToRefresh(runtime);
  useFollow(runtime);
  useAutoScroll(runtime);

  const v = useMemo(
    () => ({
      isLoading: runtime.state.isLoading,
      isLoadingBefore: runtime.refs.isLoadingBefore.current,
      isLoadingAfter: runtime.refs.isLoadingAfter.current,
      isRefreshing: runtime.refs.isRefreshing.current,
      hasMoreBefore,
      hasMoreAfter,
      hasMoreAfterStart: virtualizer.getTotalSize() + config.estimatedSize,
      getTotalSize: () => {
        let size = virtualizer.getTotalSize();
        if (hasMoreBefore) size += config.estimatedSize;
        if (hasMoreAfter) size += config.estimatedSize;
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
            record: recordsRef.current.at(index),
          };
        }),
    }),
    [virtualizer, config.estimatedSize, runtime.state.isLoading, hasMoreBefore, hasMoreAfter],
  );

  return (
    <div ref={scrollElementRef} className={cn('overflow-auto', className)} {...other}>
      {children(v)}
    </div>
  );
};

/**
 * LogViewer - Component to render virtualized list of log records
 */

export type LogViewerProps = {
  className?: string;
  client: Client;
  estimatedSize: number;
  initialPosition?: LogViewerInitialPosition;
  defaultFollow?: boolean;
  overscan?: number;
  batchSizeInitial?: number;
  batchSizeRegular?: number;
  loadMoreThreshold?: number;
  pinToBottomTolerance?: number;
  children: (virtualizer: LogViewerVirtualizer) => React.ReactNode;
};

export const LogViewer = forwardRef<LogViewerHandle, LogViewerProps>(
  (
    {
      client,
      initialPosition: defaultInitialPosition = { type: 'tail' },
      defaultFollow = true,
      estimatedSize,
      overscan = 20,
      batchSizeInitial = 150,
      batchSizeRegular = 100,
      loadMoreThreshold = 50,
      pinToBottomTolerance = 10,
      children,
      ...other
    },
    ref,
  ) => {
    const [keyID, setKeyID] = useState(0);
    const [follow, setFollow] = useState(defaultFollow);
    const [initialPosition, setInitialPosition] = useState(defaultInitialPosition);
    const prevClientRef = useRef<Client>(null);

    const incrementKeyID = useCallback(() => setKeyID((id) => id + 1), []);

    const [isLoading, setIsLoading] = useState(true);
    const isLoadingBeforeRef = useRef(false);
    const isLoadingAfterRef = useRef(false);
    const isRefreshingRef = useRef(false);

    useImperativeHandle(ref, () => {
      const handle = {
        isLoading: false,
        isLoadingBefore: false,
        isLoadingAfter: false,
        isRefreshing: false,
        startFollowing: async () => {
          setFollow(true);
        },
        stopFollowing: () => {
          setFollow(false);
        },
        jumpToBeginning: async () => {
          setInitialPosition({ type: 'head' });
          incrementKeyID();
        },
        jumpToEnd: async () => {
          setInitialPosition({ type: 'tail' });
          incrementKeyID();
        },
        jumpToTime: async () => {
          incrementKeyID();
        },
        onChange: (name: string, callback: OnChangeCallback<[boolean]>) => () => {},
      };

      Object.defineProperties(handle, {
        isLoading: { get: () => isLoading },
        isLoadingBefore: { get: () => isLoadingBeforeRef.current },
        isLoadingAfter: { get: () => isLoadingAfterRef.current },
        isRefeshing: { get: () => isRefreshingRef.current },
      });

      return handle;
    }, [isLoading]);

    useEffect(() => {
      if (prevClientRef.current && prevClientRef.current !== client) incrementKeyID();
      prevClientRef.current = client;
    }, [client]);

    // Partial runtime
    const partialRuntime = {
      client,
      config: {
        initialPosition,
        follow,
        estimatedSize,
        overscan,
        batchSizeInitial,
        batchSizeRegular,
        loadMoreThreshold,
        pinToBottomTolerance,
      },
      state: {
        isLoading,
      },
      refs: {
        isLoadingBefore: isLoadingBeforeRef,
        isLoadingAfter: isLoadingAfterRef,
        isRefreshing: isRefreshingRef,
      },
      actions: {
        setIsLoading,
      },
    };

    return (
      <LogViewerInner key={keyID} partialRuntime={partialRuntime} {...other}>
        {children}
      </LogViewerInner>
    );
  },
);

LogViewer.displayName = 'LogViewer';
