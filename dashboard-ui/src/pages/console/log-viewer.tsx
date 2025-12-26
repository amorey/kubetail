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
import { cn, MapSet } from '@/lib/util';

export type Cursor = string;

export type LogRecord = {
  timestamp: Date;
  message: string;
  cursor: string;
};

export type FetchResult = {
  records: LogRecord[];
};

export type FetchOptions = {
  cursor?: Cursor | null;
  limit?: number;
};

export type SubscriptionCallback = (record: LogRecord) => void;

export type SubscriptionOptions = {
  after?: Cursor | null;
};

export type SubscriptionCancelFunction = () => void;

export type Client = {
  fetchSince: (options: FetchOptions) => Promise<FetchResult>;
  fetchUntil: (options: FetchOptions) => Promise<FetchResult>;
  fetchAfter: (options: FetchOptions) => Promise<FetchResult>;
  fetchBefore: (options: FetchOptions) => Promise<FetchResult>;
  subscribe: (callback: SubscriptionCallback, options?: SubscriptionOptions) => SubscriptionCancelFunction;
};

export type LogViewerInitialPosition =
  | { type: 'head'; cursor?: never }
  | { type: 'tail'; cursor?: never }
  | { type: 'cursor'; cursor: Cursor };

export type OnChangeCallback<TArgs extends unknown[] = unknown[]> = (...args: TArgs) => void;

export type OnChangeCancelFunction = () => void;

export type LogViewerHandle = {
  readonly isLoading: boolean;
  readonly isLoadingBefore: boolean;
  readonly isLoadingAfter: boolean;
  readonly isRefreshing: boolean;
  enableFollow: () => void;
  disableFollow: () => void;
  jumpToBeginning: () => Promise<void>;
  jumpToEnd: () => Promise<void>;
  jumpToCursor: (cursor: Cursor) => Promise<void>;
  onChange: (name: string, callback: OnChangeCallback<[boolean]>) => OnChangeCancelFunction;
};

export type LogViewerVirtualRow = Pick<VirtualItem, 'key'> & {
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
  readonly isRefreshing: boolean;
};

type LogViewerRuntimeRefs = {
  records: React.RefObject<DoubleTailedArray<LogRecord>>;
  scrollEl: React.RefObject<HTMLDivElement | null>;
  isAutoScrollEnabled: React.RefObject<boolean>;
  isLoadingBefore: React.RefObject<boolean>;
  isLoadingAfter: React.RefObject<boolean>;
};

type LogViewerRuntimeActions = {
  setCount: React.Dispatch<React.SetStateAction<number>>;
  setHasMoreBefore: React.Dispatch<React.SetStateAction<boolean>>;
  setHasMoreAfter: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setIsRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  dispatchEvent: (name: string, value: boolean) => void;
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
          const result = await client.fetchSince({ limit: config.batchSizeInitial + 1 });

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
          const result = await client.fetchUntil({ limit: config.batchSizeInitial + 1 });

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
        case 'cursor': {
          // Fetch BATCH_SIZE records before and after the seek timestamp
          const [beforeResult, afterResult] = await Promise.all([
            client.fetchBefore({ cursor: config.initialPosition.cursor, limit: config.batchSizeInitial + 1 }),
            client.fetchSince({ cursor: config.initialPosition.cursor, limit: config.batchSizeInitial + 1 }),
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
    const result = await client.fetchBefore({ cursor: records.first().cursor, limit: config.batchSizeRegular + 1 });

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
    const result = await client.fetchAfter({ cursor: records.last().cursor, limit: config.batchSizeRegular + 1 });

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
 * usePullToRefresh - Implement pull-to-refresh feature
 */

const usePullToRefresh = (runtime: LogViewerRuntime) => {
  const loadMoreAfter = useLoadMoreAfter(runtime);

  const { config, refs, state, actions } = runtime;

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

      refs.isLoadingAfter.current = true;
      actions.setIsRefreshing(true);

      loadMoreAfter()
        .catch((error) => {
          // Log error but don't throw - allow the UI to continue functioning
          console.error('Failed to refresh records:', error);
        })
        .finally(() => {
          requestAnimationFrame(() => {
            refs.isLoadingAfter.current = false;
            actions.setIsRefreshing(false);
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
 * useFollowFromEnd - Implement follow-from-end behavior
 */

const useFollowFromEnd = ({ client, config, state, refs, actions, services }: LogViewerRuntime) => {
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

    const opts = records.length ? { after: records.last().cursor } : undefined;

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
 * useAutoScroll - Implement auto-scroll
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
    state: Pick<LogViewerRuntimeState, 'isLoading' | 'isRefreshing'>;
    refs: Pick<LogViewerRuntimeRefs, 'isLoadingBefore' | 'isLoadingAfter'>;
    actions: Pick<LogViewerRuntimeActions, 'setIsLoading' | 'setIsRefreshing' | 'dispatchEvent'>;
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
  useFollowFromEnd(runtime);
  useAutoScroll(runtime);

  const v = useMemo(
    () => ({
      isLoading: runtime.state.isLoading,
      isLoadingBefore: runtime.refs.isLoadingBefore.current,
      isLoadingAfter: runtime.refs.isLoadingAfter.current,
      isRefreshing: runtime.state.isRefreshing,
      hasMoreBefore,
      hasMoreAfter,
      hasMoreAfterStart: virtualizer.getTotalSize() + (hasMoreBefore ? config.estimatedSize : 0),
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
    [
      virtualizer,
      count,
      config.estimatedSize,
      runtime.state.isLoading,
      runtime.state.isRefreshing,
      hasMoreBefore,
      hasMoreAfter,
    ],
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
    const onChangeQueueRef = useRef(new MapSet<string, OnChangeCallback<[boolean]>>());

    const incrementKeyID = useCallback(() => setKeyID((id) => id + 1), []);

    const [isLoading, setIsLoading] = useState(true);
    const isLoadingBeforeRef = useRef(false);
    const isLoadingAfterRef = useRef(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useImperativeHandle(ref, () => {
      const handle = {
        isLoading,
        isRefreshing,
        isLoadingBefore: false,
        isLoadingAfter: false,
        enableFollow: () => {
          setFollow(true);
        },
        disableFollow: () => {
          setFollow(false);
        },
        jumpToBeginning: async () => {
          setInitialPosition({ type: 'head' });
          incrementKeyID();
          // TODO: wait for isLoading to resolve
        },
        jumpToEnd: async () => {
          setInitialPosition({ type: 'tail' });
          incrementKeyID();
          // TODO: wait for isLoading to resolve
        },
        jumpToCursor: async (cursor: Cursor) => {
          setInitialPosition({ type: 'cursor', cursor });
          incrementKeyID();
          // TODO: wait for isLoading to resolve
        },
        onChange: (name: string, callback: OnChangeCallback<[boolean]>) => {
          onChangeQueueRef.current.add(name, callback);
          return () => {
            const q = onChangeQueueRef.current.get(name);
            if (q) q.delete(callback);
          };
        },
      };

      Object.defineProperties(handle, {
        isLoadingBefore: { get: () => isLoadingBeforeRef.current },
        isLoadingAfter: { get: () => isLoadingAfterRef.current },
      });

      return handle;
    }, [isLoading, isRefreshing]);

    // Increment key when client changes to force new virtualizer
    useEffect(() => {
      if (prevClientRef.current && prevClientRef.current !== client) incrementKeyID();
      prevClientRef.current = client;
    }, [client]);

    const dispatchEvent = useCallback((name: string, value: boolean) => {
      const q = onChangeQueueRef.current.get(name);
      if (q) q.forEach((callback) => callback(value));
    }, []);

    const setIsLoadingOverride = useCallback((value: boolean) => {
      setIsLoading(value);
      dispatchEvent('isLoading', value);
    }, []) as React.Dispatch<React.SetStateAction<boolean>>;

    const setIsRefreshingOverride = useCallback((value: boolean) => {
      setIsRefreshing(value);
      dispatchEvent('isRefreshing', value);
    }, []) as React.Dispatch<React.SetStateAction<boolean>>;

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
        isRefreshing,
      },
      refs: {
        isLoadingBefore: isLoadingBeforeRef,
        isLoadingAfter: isLoadingAfterRef,
      },
      actions: {
        setIsLoading: setIsLoadingOverride,
        setIsRefreshing: setIsRefreshingOverride,
        dispatchEvent,
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
