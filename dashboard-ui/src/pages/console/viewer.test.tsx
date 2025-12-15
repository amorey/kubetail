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

import { act, render, screen, waitFor } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WatchEventType } from '@/lib/graphql/dashboard/__generated__/graphql';

import { isFollowAtom, isLoadingAtom, isReadyAtom, isWrapAtom, visibleColsAtom } from './state';
import { ViewerColumn } from './shared';
import { ViewerProvider, useNodes, useViewerFacets, useViewerMetadata } from './viewer';

const mockUseSubscription = vi.fn();
const mockUseQuery = vi.fn();
const mockUseListQueryWithSubscription = vi.fn();
const mockUseIsClusterAPIEnabled = vi.fn();

// Track virtualizer calls for testing
const mockScrollToIndex = vi.fn();
const mockMeasure = vi.fn();
const mockGetVirtualItems = vi.fn();
const mockGetTotalSize = vi.fn();

// Mock virtualizer state
let virtualizerConfig: any = null;

vi.mock('@apollo/client', () => ({
  useSubscription: (query: any, options: any) => mockUseSubscription(query, options),
  useQuery: (...args: any[]) => mockUseQuery(...args),
}));

vi.mock('@/lib/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hooks')>('@/lib/hooks');

  return {
    ...actual,
    useListQueryWithSubscription: (opts: any) => mockUseListQueryWithSubscription(opts),
    useIsClusterAPIEnabled: (kubeContext: string | null) => mockUseIsClusterAPIEnabled(kubeContext),
    // Keep nextTick synchronous to simplify scheduling in tests.
    useNextTick: () => (fn: () => void) => fn(),
  };
});

vi.mock('@/components/utils/LoadingPage', () => ({
  default: () => <div data-testid="loading-page" />,
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (config: any) => {
    virtualizerConfig = config;
    const virtualItems = mockGetVirtualItems() || [];
    return {
      getVirtualItems: () => virtualItems,
      getTotalSize: () => mockGetTotalSize() || config.count * 24,
      scrollToIndex: mockScrollToIndex,
      measure: mockMeasure,
      measureElement: vi.fn(),
    };
  },
}));

vi.mock('react-virtualized-auto-sizer', () => ({
  default: ({ children }: { children: (size: { height: number; width: number }) => React.ReactNode }) =>
    children({ height: 500, width: 800 }),
}));

// Mock LogRecordsFetcher to prevent API calls
const mockFetcherFetch = vi.fn();
const mockFetcherReset = vi.fn();

vi.mock('./log-records-fetcher', () => ({
  LogRecordsFetcher: ({ ref }: { ref: React.RefObject<any> }) => {
    // Expose mock methods via ref
    if (ref) {
      // eslint-disable-next-line no-param-reassign
      ref.current = {
        fetch: mockFetcherFetch,
        reset: mockFetcherReset,
      };
    }
    return null;
  },
}));

const defaultViewerProviderProps = {
  kubeContext: 'ctx',
  sources: [] as string[],
  sourceFilter: {},
  grep: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  virtualizerConfig = null;
  mockUseIsClusterAPIEnabled.mockReturnValue(true);
  mockUseSubscription.mockReturnValue({ loading: false });
  mockUseQuery.mockReturnValue({ refetch: vi.fn(), subscribeToMore: vi.fn() });
  mockGetVirtualItems.mockReturnValue([]);
  mockGetTotalSize.mockReturnValue(0);
  // Default fetch returns empty records
  mockFetcherFetch.mockResolvedValue({ records: [], nextCursor: null });
});

describe('useNodes', () => {
  it('returns nodes and loading flag from the list query', () => {
    const node = {
      __typename: 'CoreV1Node',
      id: '1',
      metadata: {
        name: 'node-a',
        uid: 'uid-1',
        creationTimestamp: '2024-01-01T00:00:00Z',
        deletionTimestamp: null,
        resourceVersion: '1',
        labels: null,
        annotations: null,
      },
    };

    mockUseListQueryWithSubscription.mockReturnValue({
      fetching: false,
      data: { coreV1NodesList: { items: [node] } },
    });

    const NodesConsumer = () => {
      const { loading, nodes } = useNodes();
      return (
        <div>
          <div data-testid="loading">{loading ? 'true' : 'false'}</div>
          <div data-testid="nodes">{nodes.map((n) => n.metadata.name).join(',')}</div>
        </div>
      );
    };

    render(
      <ViewerProvider {...defaultViewerProviderProps}>
        <NodesConsumer />
      </ViewerProvider>,
    );

    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(screen.getByTestId('nodes').textContent).toBe('node-a');
  });
});

describe('useViewerMetadata', () => {
  it('returns atom values and search flag', () => {
    const store = createStore();
    store.set(isReadyAtom, true);
    store.set(isLoadingAtom, false);
    store.set(isFollowAtom, false);

    const MetadataConsumer = () => {
      const metadata = useViewerMetadata();
      return (
        <div>
          <div data-testid="ready">{String(metadata.isReady)}</div>
          <div data-testid="loading">{String(metadata.isLoading)}</div>
          <div data-testid="follow">{String(metadata.isFollow)}</div>
          <div data-testid="search">{String(metadata.isSearchEnabled)}</div>
        </div>
      );
    };

    render(
      <Provider store={store}>
        <ViewerProvider {...defaultViewerProviderProps}>
          <MetadataConsumer />
        </ViewerProvider>
      </Provider>,
    );

    expect(screen.getByTestId('ready').textContent).toBe('true');
    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(screen.getByTestId('follow').textContent).toBe('false');
    expect(screen.getByTestId('search').textContent).toBe('true');
  });
});

describe('useViewerFacets', () => {
  it('aggregates facet counters from sources and nodes', async () => {
    const nodes = [
      {
        __typename: 'CoreV1Node',
        id: 'node-0',
        metadata: {
          name: 'node-0',
          uid: 'uid-0',
          creationTimestamp: '2024-01-01T00:00:00Z',
          deletionTimestamp: null,
          resourceVersion: '1',
          labels: null,
          annotations: null,
        },
      },
    ];

    mockUseListQueryWithSubscription.mockReturnValue({
      fetching: false,
      data: { coreV1NodesList: { items: nodes } },
    });

    const sourceWest = {
      __typename: 'LogSource',
      namespace: 'default',
      podName: 'app',
      containerName: 'main',
      containerID: 'cid-1',
      metadata: { region: 'us-west', zone: 'zone-a', os: 'linux', arch: 'amd64', node: 'node-1' },
    };

    const sourceEast = {
      __typename: 'LogSource',
      namespace: 'kube-system',
      podName: 'agent',
      containerName: 'sidecar',
      containerID: 'cid-2',
      metadata: { region: 'us-east', zone: 'zone-b', os: 'linux', arch: 'arm64', node: 'node-2' },
    };

    let onData: ((args: any) => void) | undefined;
    mockUseSubscription.mockImplementation((_, options) => {
      onData = options?.onData;
      return { loading: false };
    });

    const FacetsConsumer = () => {
      const facets = useViewerFacets();
      return (
        <div>
          <div data-testid="region-west">{facets.region.get('us-west') ?? 0}</div>
          <div data-testid="region-east">{facets.region.get('us-east') ?? 0}</div>
          <div data-testid="node-zero">{facets.node.get('node-0') ?? 0}</div>
          <div data-testid="node-one">{facets.node.get('node-1') ?? 0}</div>
          <div data-testid="node-two">{facets.node.get('node-2') ?? 0}</div>
        </div>
      );
    };

    render(
      <ViewerProvider {...defaultViewerProviderProps}>
        <FacetsConsumer />
      </ViewerProvider>,
    );

    act(() => {
      onData?.({ data: { data: { logSourcesWatch: { type: WatchEventType.Added, object: sourceWest } } } });
      onData?.({ data: { data: { logSourcesWatch: { type: WatchEventType.Added, object: sourceEast } } } });
    });

    await waitFor(() => {
      expect(screen.getByTestId('region-west').textContent).toBe('1');
      expect(screen.getByTestId('region-east').textContent).toBe('1');
      expect(screen.getByTestId('node-zero').textContent).toBe('0');
      expect(screen.getByTestId('node-one').textContent).toBe('1');
      expect(screen.getByTestId('node-two').textContent).toBe('1');
    });
  });
});

describe('ViewerProvider', () => {
  it('shows loading page while cluster API status is pending', () => {
    mockUseIsClusterAPIEnabled.mockReturnValueOnce(undefined);

    render(
      <ViewerProvider {...defaultViewerProviderProps}>
        <div data-testid="child">ready</div>
      </ViewerProvider>,
    );

    expect(screen.getByTestId('loading-page')).toBeInTheDocument();
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('renders children when cluster API status is resolved', () => {
    mockUseIsClusterAPIEnabled.mockReturnValueOnce(true);

    render(
      <ViewerProvider {...defaultViewerProviderProps}>
        <div data-testid="child">ready</div>
      </ViewerProvider>,
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-page')).toBeNull();
  });
});

/**
 * Virtualization behavior tests
 */

// Helper to create mock log records
const createMockLogRecord = (index: number) => ({
  id: `record-${index}`,
  timestamp: new Date(`2024-01-01T00:00:${String(index).padStart(2, '0')}.000Z`).toISOString(),
  message: `Log message ${index}`,
  source: {
    namespace: 'default',
    podName: `pod-${index}`,
    containerName: 'main',
    containerID: `container-${index}`,
    metadata: {
      region: 'us-west',
      zone: 'zone-a',
      os: 'linux',
      arch: 'amd64',
      node: 'node-1',
    },
  },
});

describe('Virtualization behavior', () => {
  describe('virtualizer configuration', () => {
    it('configures overscan count of 20', async () => {
      // Import the actual Viewer component to trigger useVirtualizer
      const { Viewer } = await import('./viewer');

      // Setup mock for nodes query
      mockUseListQueryWithSubscription.mockReturnValue({
        fetching: false,
        data: { coreV1NodesList: { items: [] } },
      });

      // Only render the placeholder row (index 0) to avoid missing record errors
      mockGetVirtualItems.mockReturnValue([{ index: 0, key: 'item-0', start: 0, size: 24 }]);

      render(
        <ViewerProvider {...defaultViewerProviderProps}>
          <Viewer defaultMode="tail" defaultSince={null} />
        </ViewerProvider>,
      );

      await waitFor(() => {
        expect(virtualizerConfig).not.toBeNull();
      });

      expect(virtualizerConfig.overscan).toBe(20);
    });

    it('uses fixed row height of 24px when wrap is disabled', async () => {
      const { Viewer } = await import('./viewer');
      const store = createStore();
      store.set(isWrapAtom, false);

      mockUseListQueryWithSubscription.mockReturnValue({
        fetching: false,
        data: { coreV1NodesList: { items: [] } },
      });

      mockGetVirtualItems.mockReturnValue([{ index: 0, key: 'item-0', start: 0, size: 24 }]);

      render(
        <Provider store={store}>
          <ViewerProvider {...defaultViewerProviderProps}>
            <Viewer defaultMode="tail" defaultSince={null} />
          </ViewerProvider>
        </Provider>,
      );

      await waitFor(() => {
        expect(virtualizerConfig).not.toBeNull();
      });

      // estimateSize should return 24 for placeholder rows
      const estimatedSize = virtualizerConfig.estimateSize(0);
      expect(estimatedSize).toBe(24);
    });

    it('calculates item count with placeholder row at start', async () => {
      const { Viewer } = await import('./viewer');

      mockUseListQueryWithSubscription.mockReturnValue({
        fetching: false,
        data: { coreV1NodesList: { items: [] } },
      });

      mockGetVirtualItems.mockReturnValue([{ index: 0, key: 'item-0', start: 0, size: 24 }]);

      render(
        <ViewerProvider {...defaultViewerProviderProps}>
          <Viewer defaultMode="tail" defaultSince={null} />
        </ViewerProvider>,
      );

      await waitFor(() => {
        expect(virtualizerConfig).not.toBeNull();
      });

      // With 0 items, count should be 1 (just the "beginning of feed" row)
      // The implementation adds +1 for the beginning row
      expect(virtualizerConfig.count).toBeGreaterThanOrEqual(1);
    });

    it('includes log records in item count', async () => {
      const { Viewer } = await import('./viewer');

      // Setup fetch to return log records
      const records = [createMockLogRecord(0), createMockLogRecord(1), createMockLogRecord(2)];
      mockFetcherFetch.mockResolvedValue({ records, nextCursor: null });

      mockUseListQueryWithSubscription.mockReturnValue({
        fetching: false,
        data: { coreV1NodesList: { items: [] } },
      });

      mockGetVirtualItems.mockReturnValue([{ index: 0, key: 'item-0', start: 0, size: 24 }]);

      render(
        <ViewerProvider {...defaultViewerProviderProps}>
          <Viewer defaultMode="tail" defaultSince={null} />
        </ViewerProvider>,
      );

      // Wait for the fetch to complete and items to be set
      await waitFor(() => {
        expect(virtualizerConfig).not.toBeNull();
        // count = items.length + 1 (placeholder row) = 3 + 1 = 4
        expect(virtualizerConfig.count).toBe(4);
      });
    });
  });

  describe('virtual item rendering', () => {
    it('only renders virtual items returned by virtualizer', async () => {
      const { Viewer } = await import('./viewer');
      const store = createStore();
      store.set(visibleColsAtom, new Set([ViewerColumn.Message]));

      // Setup fetch to return no records initially - just test the placeholder
      mockFetcherFetch.mockResolvedValue({ records: [], nextCursor: null });

      mockUseListQueryWithSubscription.mockReturnValue({
        fetching: false,
        data: { coreV1NodesList: { items: [] } },
      });

      // Simulate virtualizer returning only the placeholder (index 0)
      mockGetVirtualItems.mockReturnValue([{ index: 0, key: 'item-0', start: 0, size: 24 }]);

      render(
        <Provider store={store}>
          <ViewerProvider {...defaultViewerProviderProps}>
            <Viewer defaultMode="tail" defaultSince={null} />
          </ViewerProvider>
        </Provider>,
      );

      await waitFor(() => {
        expect(virtualizerConfig).not.toBeNull();
        // Check that only the placeholder row is rendered
        const renderedRows = screen.getAllByRole('generic').filter((el) => el.dataset.index !== undefined);
        expect(renderedRows.length).toBe(1);
      });
    });

    it('applies correct transform for virtual item positioning', async () => {
      const { Viewer } = await import('./viewer');

      // Setup fetch to return log records
      mockFetcherFetch.mockResolvedValue({ records: [createMockLogRecord(0)], nextCursor: null });

      mockUseListQueryWithSubscription.mockReturnValue({
        fetching: false,
        data: { coreV1NodesList: { items: [] } },
      });

      // Return item at index 1 (first actual log record, after placeholder at 0)
      const virtualItems = [{ index: 1, key: 'item-1', start: 24, size: 24 }];
      mockGetVirtualItems.mockReturnValue(virtualItems);

      render(
        <ViewerProvider {...defaultViewerProviderProps}>
          <Viewer defaultMode="tail" defaultSince={null} />
        </ViewerProvider>,
      );

      await waitFor(() => {
        const rowContainer = document.querySelector('[data-index="1"]');
        expect(rowContainer).not.toBeNull();
        expect((rowContainer as HTMLElement).style.transform).toBe('translateY(24px)');
      });
    });
  });

  describe('scroll behavior', () => {
    it('calls scrollToIndex with end alignment for scrollTo last', async () => {
      const { Viewer } = await import('./viewer');

      mockUseListQueryWithSubscription.mockReturnValue({
        fetching: false,
        data: { coreV1NodesList: { items: [] } },
      });

      mockGetVirtualItems.mockReturnValue([{ index: 0, key: 'item-0', start: 0, size: 24 }]);

      render(
        <ViewerProvider {...defaultViewerProviderProps}>
          <Viewer defaultMode="tail" defaultSince={null} />
        </ViewerProvider>,
      );

      await waitFor(() => {
        expect(virtualizerConfig).not.toBeNull();
      });

      // The Viewer's seekTail method should trigger scrollToIndex with 'end' alignment
      expect(mockScrollToIndex).toHaveBeenCalledWith(expect.any(Number), { align: 'end' });
    });

    it('calls scrollToIndex with start alignment for scrollTo first', async () => {
      const { Viewer } = await import('./viewer');

      mockUseListQueryWithSubscription.mockReturnValue({
        fetching: false,
        data: { coreV1NodesList: { items: [] } },
      });

      mockGetVirtualItems.mockReturnValue([{ index: 0, key: 'item-0', start: 0, size: 24 }]);

      render(
        <ViewerProvider {...defaultViewerProviderProps}>
          <Viewer defaultMode="head" defaultSince={null} />
        </ViewerProvider>,
      );

      await waitFor(() => {
        expect(virtualizerConfig).not.toBeNull();
      });

      // The Viewer's seekHead method should trigger scrollToIndex with 'start' alignment
      expect(mockScrollToIndex).toHaveBeenCalledWith(0, { align: 'start' });
    });
  });

  describe('dynamic measurement', () => {
    it('enables measureElement when wrap is enabled', async () => {
      const { Viewer } = await import('./viewer');
      const store = createStore();
      store.set(isWrapAtom, true);

      mockUseListQueryWithSubscription.mockReturnValue({
        fetching: false,
        data: { coreV1NodesList: { items: [] } },
      });

      mockGetVirtualItems.mockReturnValue([{ index: 0, key: 'item-0', start: 0, size: 24 }]);

      render(
        <Provider store={store}>
          <ViewerProvider {...defaultViewerProviderProps}>
            <Viewer defaultMode="tail" defaultSince={null} />
          </ViewerProvider>
        </Provider>,
      );

      await waitFor(() => {
        expect(virtualizerConfig).not.toBeNull();
      });

      // When wrap is enabled, measureElement should be defined
      expect(virtualizerConfig.measureElement).toBeDefined();
    });

    it('disables measureElement when wrap is disabled', async () => {
      const { Viewer } = await import('./viewer');
      const store = createStore();
      store.set(isWrapAtom, false);

      mockUseListQueryWithSubscription.mockReturnValue({
        fetching: false,
        data: { coreV1NodesList: { items: [] } },
      });

      mockGetVirtualItems.mockReturnValue([{ index: 0, key: 'item-0', start: 0, size: 24 }]);

      render(
        <Provider store={store}>
          <ViewerProvider {...defaultViewerProviderProps}>
            <Viewer defaultMode="tail" defaultSince={null} />
          </ViewerProvider>
        </Provider>,
      );

      await waitFor(() => {
        expect(virtualizerConfig).not.toBeNull();
      });

      // When wrap is disabled, measureElement should be undefined
      expect(virtualizerConfig.measureElement).toBeUndefined();
    });

    it('calls measure on virtualizer when wrap state changes', async () => {
      const { Viewer } = await import('./viewer');
      const store = createStore();
      store.set(isWrapAtom, true);

      mockUseListQueryWithSubscription.mockReturnValue({
        fetching: false,
        data: { coreV1NodesList: { items: [] } },
      });

      mockGetVirtualItems.mockReturnValue([{ index: 0, key: 'item-0', start: 0, size: 24 }]);

      render(
        <Provider store={store}>
          <ViewerProvider {...defaultViewerProviderProps}>
            <Viewer defaultMode="tail" defaultSince={null} />
          </ViewerProvider>
        </Provider>,
      );

      await waitFor(() => {
        expect(virtualizerConfig).not.toBeNull();
      });

      // Measure should be called when sizing logic triggers
      expect(mockMeasure).toHaveBeenCalled();
    });
  });

  describe('total size calculation', () => {
    it('sets inner container height to virtualizer total size', async () => {
      const { Viewer } = await import('./viewer');

      mockUseListQueryWithSubscription.mockReturnValue({
        fetching: false,
        data: { coreV1NodesList: { items: [] } },
      });

      // Mock total size of 500px
      mockGetTotalSize.mockReturnValue(500);
      mockGetVirtualItems.mockReturnValue([{ index: 0, key: 'item-0', start: 0, size: 24 }]);

      render(
        <ViewerProvider {...defaultViewerProviderProps}>
          <Viewer defaultMode="tail" defaultSince={null} />
        </ViewerProvider>,
      );

      await waitFor(() => {
        expect(virtualizerConfig).not.toBeNull();
      });

      // Find the inner container that uses getTotalSize for height
      const innerContainer = document.querySelector('[style*="height: 500px"]');
      expect(innerContainer).not.toBeNull();
    });
  });

  describe('placeholder rows', () => {
    it('renders beginning of feed message for first row without hasMoreBefore', async () => {
      const { Viewer } = await import('./viewer');

      mockUseListQueryWithSubscription.mockReturnValue({
        fetching: false,
        data: { coreV1NodesList: { items: [] } },
      });

      // Return only the first row (index 0)
      mockGetVirtualItems.mockReturnValue([{ index: 0, key: 'item-0', start: 0, size: 24 }]);

      render(
        <ViewerProvider {...defaultViewerProviderProps}>
          <Viewer defaultMode="head" defaultSince={null} />
        </ViewerProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Beginning of feed')).toBeInTheDocument();
      });
    });
  });

  describe('log record rendering', () => {
    it('renders log records at correct virtual indices', async () => {
      const { Viewer } = await import('./viewer');
      const store = createStore();
      store.set(visibleColsAtom, new Set([ViewerColumn.Message]));

      // Setup fetch to return a log record
      mockFetcherFetch.mockResolvedValue({ records: [createMockLogRecord(0)], nextCursor: null });

      mockUseListQueryWithSubscription.mockReturnValue({
        fetching: false,
        data: { coreV1NodesList: { items: [] } },
      });

      // Render index 1 (first log record after placeholder at index 0)
      mockGetVirtualItems.mockReturnValue([{ index: 1, key: 'item-1', start: 24, size: 24 }]);

      render(
        <Provider store={store}>
          <ViewerProvider {...defaultViewerProviderProps}>
            <Viewer defaultMode="tail" defaultSince={null} />
          </ViewerProvider>
        </Provider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Log message 0')).toBeInTheDocument();
      });
    });

    it('renders multiple log records in virtual window', async () => {
      const { Viewer } = await import('./viewer');
      const store = createStore();
      store.set(visibleColsAtom, new Set([ViewerColumn.Message]));

      // Setup fetch to return multiple log records
      const records = [createMockLogRecord(0), createMockLogRecord(1), createMockLogRecord(2)];
      mockFetcherFetch.mockResolvedValue({ records, nextCursor: null });

      mockUseListQueryWithSubscription.mockReturnValue({
        fetching: false,
        data: { coreV1NodesList: { items: [] } },
      });

      // Start with just placeholder, virtual items will update after fetch
      mockGetVirtualItems.mockReturnValue([{ index: 0, key: 'item-0', start: 0, size: 24 }]);

      const { rerender } = render(
        <Provider store={store}>
          <ViewerProvider {...defaultViewerProviderProps}>
            <Viewer defaultMode="tail" defaultSince={null} />
          </ViewerProvider>
        </Provider>,
      );

      // Wait for fetch to complete
      await waitFor(() => {
        expect(mockFetcherFetch).toHaveBeenCalled();
      });

      // Now update virtual items to include log records (simulating scroll/viewport)
      mockGetVirtualItems.mockReturnValue([
        { index: 0, key: 'item-0', start: 0, size: 24 },
        { index: 1, key: 'item-1', start: 24, size: 24 },
        { index: 2, key: 'item-2', start: 48, size: 24 },
        { index: 3, key: 'item-3', start: 72, size: 24 },
      ]);

      // Trigger re-render to pick up new virtual items
      rerender(
        <Provider store={store}>
          <ViewerProvider {...defaultViewerProviderProps}>
            <Viewer defaultMode="tail" defaultSince={null} />
          </ViewerProvider>
        </Provider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Log message 0')).toBeInTheDocument();
        expect(screen.getByText('Log message 1')).toBeInTheDocument();
        expect(screen.getByText('Log message 2')).toBeInTheDocument();
      });
    });
  });
});
