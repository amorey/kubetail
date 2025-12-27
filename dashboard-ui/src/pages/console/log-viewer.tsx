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
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { useBeforePaint, type BeforePaintSubscribe } from '@/lib/before-paint';
import { DoubleTailedArray } from '@/lib/double-tailed-array';
import { cn } from '@/lib/util';

export const LOGVIEWER_INITIAL_STATE = {
  isLoading: false,
} satisfies LogViewerState;

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

export type LogViewerState = {
  isLoading: boolean;
};

export type LogViewerHandle = {
  jumpToBeginning: () => Promise<void>;
  jumpToEnd: () => Promise<void>;
  jumpToCursor: (cursor: Cursor) => Promise<void>;
  subscribe: (callback: () => void) => () => void;
  getSnapshot: () => LogViewerState;
};

export type LogViewerVirtualRow = Pick<VirtualItem, 'key'> & {
  index: number;
  size: number;
  start: number;
  record: LogRecord;
};

export type LogViewerVirtualizer = {
  readonly isLoading: boolean;
  readonly hasMoreBefore: boolean;
  readonly hasMoreAfter: boolean;
  readonly isRefreshing: boolean;
  readonly hasMoreAfterRowHeight: number;
  readonly hasMoreBeforeRowHeight: number;
  readonly isRefreshingRowHeight: number;
  getTotalSize: () => number;
  getVirtualRows: () => LogViewerVirtualRow[];
  measureElement: (node: Element | null | undefined) => void;
};

type LogViewerRuntimeConfig = {
  readonly initialPosition: LogViewerInitialPosition;
  readonly follow: boolean;
  readonly overscan: number;
  readonly batchSizeInitial: number;
  readonly batchSizeRegular: number;
  readonly loadMoreThreshold: number;
  readonly pinToBottomTolerance: number;
  readonly hasMoreBeforeRowHeight: number;
  readonly hasMoreAfterRowHeight: number;
  readonly isRefreshingRowHeight: number;
  estimateRowHeight: (record: LogRecord) => number;
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
      if (cancelID) {
        cancelAnimationFrame(cancelID);
        actions.setIsLoading(false);
      }
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
            requestAnimationFrame(() => {
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
            requestAnimationFrame(() => {
              refs.isLoadingAfter.current = false;
            });
          });
      }
    }
  }, [
    virtualItems,
    config.overscan,
    config.loadMoreThreshold,
    state.count,
    state.hasMoreBefore,
    state.hasMoreAfter,
    state.isLoading,
  ]);
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

    const isAtBottom = () => {
      const { scrollTop, clientHeight, scrollHeight } = scrollElement;
      return Math.abs(scrollTop + clientHeight - scrollHeight) <= config.pinToBottomTolerance;
    };

    // Enable auto-scroll when follow is on and we're at the bottom
    if (config.follow && isAtBottom()) {
      refs.isAutoScrollEnabled.current = true;
    }

    const handleScroll = () => {
      const lastScrollTop = lastScrollTopRef.current;

      const { scrollTop } = scrollElement;

      // Update scroll position tracker
      lastScrollTopRef.current = scrollTop;

      // If scrolling up, turn off auto-scroll and exit
      if (scrollTop < lastScrollTop) {
        refs.isAutoScrollEnabled.current = false;
        return;
      }

      // If scrolled to bottom, turn on auto-scroll
      if (!refs.isAutoScrollEnabled.current && isAtBottom()) {
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
    actions: Pick<LogViewerRuntimeActions, 'setIsLoading'>;
  };
  children: (virtualizer: LogViewerVirtualizer) => React.ReactNode;
};

const LogViewerInner = ({ className = '', partialRuntime, children, ...other }: LogViewerInnerProps) => {
  const scrollElementRef = useRef<HTMLDivElement>(null);

  const recordsRef = useRef(new DoubleTailedArray<LogRecord>());
  const isLoadingBeforeRef = useRef(false);
  const isLoadingAfterRef = useRef(false);

  const [count, setCount] = useState(0);
  const [hasMoreBefore, setHasMoreBefore] = useState(false);
  const [hasMoreAfter, setHasMoreAfter] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const beforePaint = useBeforePaint(count);
  const isAutoScrollEnabledRef = useRef(false);

  const { config } = partialRuntime;

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: (index: number) => config.estimateRowHeight(recordsRef.current.at(index)),
    overscan: config.overscan,
    scrollMargin: hasMoreBefore ? config.hasMoreBeforeRowHeight : 0,
    useScrollendEvent: true,
  });

  const runtime = {
    client: partialRuntime.client,
    config: partialRuntime.config,
    state: { count, hasMoreBefore, hasMoreAfter, isRefreshing, ...partialRuntime.state },
    refs: {
      records: recordsRef,
      scrollEl: scrollElementRef,
      isAutoScrollEnabled: isAutoScrollEnabledRef,
      isLoadingBefore: isLoadingBeforeRef,
      isLoadingAfter: isLoadingAfterRef,
    },
    actions: { setCount, setHasMoreBefore, setHasMoreAfter, setIsRefreshing, ...partialRuntime.actions },
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
      isRefreshing: runtime.state.isRefreshing,
      hasMoreBefore,
      hasMoreAfter,
      hasMoreBeforeRowHeight: config.hasMoreBeforeRowHeight,
      hasMoreAfterRowHeight: config.hasMoreAfterRowHeight,
      isRefreshingRowHeight: config.isRefreshingRowHeight,
      getTotalSize: () => {
        let h = virtualizer.getTotalSize();
        if (hasMoreBefore) h += config.hasMoreBeforeRowHeight;
        if (hasMoreAfter) h += config.hasMoreBeforeRowHeight;
        if (runtime.state.isRefreshing) h += config.isRefreshingRowHeight;
        return h;
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
      measureElement: virtualizer.measureElement,
    }),
    [
      virtualizer,
      count,
      config.estimateRowHeight,
      config.hasMoreBeforeRowHeight,
      config.hasMoreAfterRowHeight,
      config.isRefreshingRowHeight,
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
  estimateRowHeight: (record: LogRecord) => number;
  initialPosition?: LogViewerInitialPosition;
  follow?: boolean;
  overscan?: number;
  batchSizeInitial?: number;
  batchSizeRegular?: number;
  loadMoreThreshold?: number;
  pinToBottomTolerance?: number;
  hasMoreBeforeRowHeight?: number;
  hasMoreAfterRowHeight?: number;
  isRefreshingRowHeight?: number;
  children: (virtualizer: LogViewerVirtualizer) => React.ReactNode;
};

export const LogViewer = forwardRef<LogViewerHandle, LogViewerProps>(
  (
    {
      client,
      initialPosition: defaultInitialPosition = { type: 'tail' },
      follow = true,
      estimateRowHeight,
      overscan = 20,
      batchSizeInitial = 150,
      batchSizeRegular = 100,
      loadMoreThreshold = 50,
      pinToBottomTolerance = 10,
      hasMoreBeforeRowHeight = 0,
      hasMoreAfterRowHeight = 0,
      isRefreshingRowHeight = 0,
      children,
      ...other
    },
    ref,
  ) => {
    const [keyID, setKeyID] = useState(0);
    const [initialPosition, setInitialPosition] = useState(defaultInitialPosition);
    const prevClientRef = useRef<Client>(null);
    const listenerQueueRef = useRef(new Set<() => void>());

    const incrementKeyID = useCallback(() => setKeyID((id) => id + 1), []);

    const [isLoading, setIsLoading] = useState<boolean>(LOGVIEWER_INITIAL_STATE.isLoading);

    const state = useMemo<LogViewerState>(
      () => ({
        isLoading,
      }),
      [isLoading],
    );
    const stateRef = useRef(state);

    // Notify listeners when state changes
    useEffect(() => {
      stateRef.current = state;
      listenerQueueRef.current.forEach((callback) => callback());
    }, [state]);

    useImperativeHandle(
      ref,
      () => ({
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
        subscribe: (callback: () => void) => {
          listenerQueueRef.current.add(callback);
          return () => {
            listenerQueueRef.current.delete(callback);
          };
        },
        getSnapshot: () => stateRef.current,
      }),
      [],
    );

    // Increment key when client changes to force new virtualizer
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
        estimateRowHeight,
        overscan,
        batchSizeInitial,
        batchSizeRegular,
        loadMoreThreshold,
        pinToBottomTolerance,
        hasMoreBeforeRowHeight,
        hasMoreAfterRowHeight,
        isRefreshingRowHeight,
      },
      state: {
        isLoading,
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

/**
 * useLogViewerState - Hook to subscribe to LogViewer external state reactively
 */

function createLogViewerStore(handle: LogViewerHandle | null) {
  if (handle) return { subscribe: handle.subscribe, getSnapshot: handle.getSnapshot };
  return {
    subscribe: (_: () => void) => () => {},
    getSnapshot: () => LOGVIEWER_INITIAL_STATE,
  };
}

export function useLogViewerState(
  logViewerRef: React.RefObject<LogViewerHandle | null>,
  dependencies: any[],
): LogViewerState {
  // Initialize store
  const [store, setStore] = useState(() => createLogViewerStore(logViewerRef.current));

  // Update based on user-provided dependencies
  useEffect(() => {
    setStore(createLogViewerStore(logViewerRef.current));
  }, dependencies);

  // Return sync external store instance
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
