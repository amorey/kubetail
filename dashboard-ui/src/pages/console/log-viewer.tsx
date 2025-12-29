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
import React, {
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

export class UninitializedRecordsError extends Error {
  constructor() {
    super(`Records uninitialized`);
    this.name = 'UninitializedRecordsError';
  }
}

export type Cursor = string;

export type LogRecord = {
  timestamp: string;
  message: string;
  cursor: Cursor;
  source: {
    metadata: {
      region: string;
      zone: string;
      os: string;
      arch: string;
      node: string;
    };
    namespace: string;
    podName: string;
    containerName: string;
    containerID: string;
  };
};

export type FetchResult = {
  records: LogRecord[];
  nextCursor: string | null;
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
  readonly range: { startIndex: number; endIndex: number } | null;
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
    beforePaint: BeforePaintSubscribe;
    virtualizer: Virtualizer<HTMLDivElement, Element>;
    records: LogRecordsService;
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
          const result = await client.fetchSince({ limit: config.batchSizeInitial });

          // Update UI
          if (result.records.length) {
            if (result.nextCursor) actions.setHasMoreAfter(true);
            services.records.new(result.records);
          }

          break;
        }
        case 'tail': {
          const result = await client.fetchUntil({ limit: config.batchSizeInitial });

          // Update UI
          if (result.records.length) {
            if (result.nextCursor) actions.setHasMoreBefore(true);
            const beforePaintPromise = services.beforePaint(() => {
              const scrollElement = refs.scrollEl.current;
              if (scrollElement) scrollElement.scrollTop = scrollElement.scrollHeight;
            });

            services.records.new(result.records);

            await beforePaintPromise;
          }

          if (config.follow) refs.isAutoScrollEnabled.current = true;

          break;
        }
        case 'cursor': {
          // Fetch BATCH_SIZE records before and after the seek timestamp
          const [beforeResult, afterResult] = await Promise.all([
            client.fetchBefore({ cursor: config.initialPosition.cursor, limit: config.batchSizeInitial }),
            client.fetchSince({ cursor: config.initialPosition.cursor, limit: config.batchSizeInitial }),
          ]);

          // Update UI
          if (beforeResult.records.length || afterResult.records.length) {
            // Handle cursors for before results
            if (beforeResult.nextCursor) actions.setHasMoreBefore(true);

            // Handle cursors for after results
            if (afterResult.nextCursor) actions.setHasMoreAfter(true);

            // Scroll to the middle (where the seek timestamp should be)
            const beforePaintPromise = services.beforePaint(() => {
              services.virtualizer.scrollToIndex(beforeResult.records.length, { align: 'start' });
            });

            // Combine results
            services.records.new([...beforeResult.records, ...afterResult.records]);

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
    const result = await client.fetchBefore({
      cursor: services.records.first().cursor,
      limit: config.batchSizeRegular,
    });

    // Update `hasMoreBefore`
    if (result.nextCursor === null) actions.setHasMoreBefore(false);

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

      services.records.prepend(result.records);

      await beforePaintPromise;
    }
  }, [client, config.batchSizeRegular]);

/**
 * useLoadMoreAfter - Returns stable loadMoreAfter function
 */

const useLoadMoreAfter = ({ client, config, actions, services }: LogViewerRuntime) =>
  useCallback(async () => {
    // Get data
    const result = await client.fetchAfter({ cursor: services.records.last().cursor, limit: config.batchSizeRegular });

    // Update `hasMoreAfter`
    if (result.nextCursor === null) actions.setHasMoreAfter(false);

    // Update UI
    if (result.records.length) {
      // Hack to get around https://github.com/TanStack/virtual/issues/1094
      services.virtualizer.isScrolling = false;

      services.records.append(result.records);
    }
  }, [client, config.batchSizeRegular]);

/**
 * useLoadMore - Load more hook
 */

const useLoadMore = (runtime: LogViewerRuntime) => {
  const loadMoreBefore = useLoadMoreBefore(runtime);
  const loadMoreAfter = useLoadMoreAfter(runtime);

  const { config, refs, state, services } = runtime;

  const virtualizerRange = services.virtualizer.range;

  const countRef = useRef(state.count);
  countRef.current = state.count;

  useEffect(() => {
    if (!virtualizerRange || state.isLoading) return;

    if (state.hasMoreBefore && !refs.isLoadingBefore.current) {
      if (virtualizerRange.startIndex <= config.loadMoreThreshold - config.overscan) {
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
      if (virtualizerRange.endIndex >= countRef.current - 1 - config.loadMoreThreshold + config.overscan) {
        refs.isLoadingAfter.current = true;
        loadMoreAfter()
          .catch((error) => {
            // Log error and allow the UI to continue functioning
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
    virtualizerRange?.startIndex,
    virtualizerRange?.endIndex,
    state.hasMoreBefore,
    state.hasMoreAfter,
    state.isLoading,
    config.overscan,
    config.loadMoreThreshold,
  ]);
};

/**
 * usePullToRefresh - Implement pull-to-refresh feature
 */

const usePullToRefresh = (runtime: LogViewerRuntime) => {
  const loadMoreAfter = useLoadMoreAfter(runtime);

  const { config, refs, state, actions } = runtime;
  const wheelRafRef = useRef<number | null>(null);

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
      if (wheelRafRef.current !== null) return;

      const { deltaY } = event;

      wheelRafRef.current = requestAnimationFrame(() => {
        wheelRafRef.current = null;

        if (deltaY <= 0) return;
        if (!isAtBottom()) return;
        if (refs.isLoadingAfter.current) return;

        refs.isLoadingAfter.current = true;
        actions.setIsRefreshing(true);

        loadMoreAfter()
          .catch((error) => {
            // Log error and allow the UI to continue functioning
            console.error('Failed to refresh records:', error);
          })
          .finally(() => {
            requestAnimationFrame(() => {
              refs.isLoadingAfter.current = false;
              actions.setIsRefreshing(false);
            });
          });
      });
    };

    scrollElement.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      if (wheelRafRef.current !== null) {
        cancelAnimationFrame(wheelRafRef.current);
        wheelRafRef.current = null;
      }
      scrollElement.removeEventListener('wheel', handleWheel);
    };
  }, [config.follow, config.loadMoreThreshold, config.pinToBottomTolerance, state.isLoading, state.hasMoreAfter]);
};

/**
 * useFollowFromEnd - Implement follow-from-end behavior
 */

const useFollowFromEnd = ({ client, config, state, refs, services }: LogViewerRuntime) => {
  useEffect(() => {
    if (!config.follow || state.isLoading || state.hasMoreAfter) return;

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
      services.records.append(pendingRecords);

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

    const opts = services.records.length() ? { after: services.records.last().cursor } : undefined;

    const unsubscribe = client.subscribe(cb, opts);

    return () => {
      if (rafID !== null) cancelAnimationFrame(rafID);

      // Flush any remaining records before cleanup
      flush();
      unsubscribe();
    };
  }, [client, config.follow, state.isLoading, state.hasMoreAfter]);
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
 * useLogRecordsService - Custom hook to interface with the log records cache
 */

type LogRecordInternal = LogRecord & {
  key: number;
};

type LogRecordsService = {
  new: (records: LogRecord[]) => void;
  append: (records: LogRecord[]) => void;
  prepend: (records: LogRecord[]) => void;
  get: (index: number) => LogRecordInternal;
  getKey: (index: number) => number;
  first: () => LogRecordInternal;
  last: () => LogRecordInternal;
  length: () => number;
};

function useLogRecordsService(setCount: React.Dispatch<React.SetStateAction<number>>): LogRecordsService {
  // RecordsRef will never be null so this assertion is safe
  const recordsRef = useRef(null) as unknown as React.RefObject<DoubleTailedArray<LogRecordInternal>>;

  const keyRef = useRef(0);

  const addKeys = useCallback((records: LogRecord[]) => {
    for (let i = 0; i < records.length; i += 1) {
      (records[i] as LogRecordInternal).key = keyRef.current;
      keyRef.current += 1;
    }
  }, []);

  return useMemo(
    () => ({
      new: (records: LogRecord[]) => {
        addKeys(records);
        recordsRef.current = new DoubleTailedArray(records as LogRecordInternal[]);
        setCount(recordsRef.current.length);
      },
      append: (records: LogRecord[]) => {
        addKeys(records);
        recordsRef.current.append(records as LogRecordInternal[]);
        setCount(recordsRef.current.length);
      },
      prepend: (records: LogRecord[]) => {
        addKeys(records);
        recordsRef.current.prepend(records as LogRecordInternal[]);
        setCount(recordsRef.current.length);
      },
      get: (index: number) => recordsRef.current.at(index),
      getKey: (index: number) => recordsRef.current.at(index).key,
      first: () => recordsRef.current.first(),
      last: () => recordsRef.current.last(),
      length: () => recordsRef.current?.length ?? 0,
    }),
    [],
  );
}

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

  const isLoadingBeforeRef = useRef(false);
  const isLoadingAfterRef = useRef(false);

  const [count, setCount] = useState(0);
  const records = useLogRecordsService(setCount);

  const [hasMoreBefore, setHasMoreBefore] = useState(false);
  const [hasMoreAfter, setHasMoreAfter] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const beforePaint = useBeforePaint(count);
  const isAutoScrollEnabledRef = useRef(false);

  const { config } = partialRuntime;

  const estimateSize = useCallback(
    (index: number) => config.estimateRowHeight(records.get(index)),
    [config.estimateRowHeight],
  );

  const getItemKey = useCallback((index: number) => records.getKey(index), []);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollElementRef.current,
    estimateSize,
    getItemKey,
    overscan: config.overscan,
    scrollMargin: hasMoreBefore ? config.hasMoreBeforeRowHeight : 0,
    useScrollendEvent: true,
  });

  const runtime = {
    client: partialRuntime.client,
    config: partialRuntime.config,
    state: { count, hasMoreBefore, hasMoreAfter, isRefreshing, ...partialRuntime.state },
    refs: {
      scrollEl: scrollElementRef,
      isAutoScrollEnabled: isAutoScrollEnabledRef,
      isLoadingBefore: isLoadingBeforeRef,
      isLoadingAfter: isLoadingAfterRef,
    },
    actions: { setCount, setHasMoreBefore, setHasMoreAfter, setIsRefreshing, ...partialRuntime.actions },
    services: { beforePaint, virtualizer, records },
  } satisfies LogViewerRuntime;

  useInit(runtime);
  useLoadMore(runtime);
  usePullToRefresh(runtime);
  useFollowFromEnd(runtime);
  useAutoScroll(runtime);

  const v = {
    isLoading: runtime.state.isLoading,
    isRefreshing: runtime.state.isRefreshing,
    hasMoreBefore,
    hasMoreAfter,
    hasMoreBeforeRowHeight: config.hasMoreBeforeRowHeight,
    hasMoreAfterRowHeight: config.hasMoreAfterRowHeight,
    isRefreshingRowHeight: config.isRefreshingRowHeight,
    range: virtualizer.range,
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
          record: records.get(index),
        };
      }),
    measureElement: virtualizer.measureElement,
  };

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
      overscan = 3,
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
  }, [...dependencies]);

  // Return sync external store instance
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
