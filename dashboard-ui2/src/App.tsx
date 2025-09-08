import { createEffect, createMemo, createSignal, onCleanup, Show, For, batch, untrack } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { createQuery } from '@tanstack/solid-query';
import {
  LOG_METADATA_LIST_FETCH,
  LOG_METADATA_LIST_WATCH,
  fetchLogMetadataListWithWorker,
  getClusterApiGraphQLEndpoint,
  type LogMetadata,
  type LogMetadataListWatchResult,
} from './graphql';
import { useDataWorker } from './use-data-worker';
import { useAnimationWorker } from './use-animation-worker';
import { useWebSocketWorker } from './use-websocket-worker';
import { useConnectionWorker } from './use-connection-worker';
import { useJsonWorker } from './use-json-worker';
import { usePerformanceMonitor } from './performance-monitor';

type Row = LogMetadata & { lastModifiedAtDate?: Date | null };

export default function App() {
  const [namespace, setNamespace] = createSignal<string>('');

  // fine-grained store keyed by id
  const [rows, setRows] = createStore<{ [id: string]: Row | undefined }>({});
  // per-row element refs (avoid querySelectorAll)
  const rowRefs = new Map<string, HTMLTableRowElement>();
  
  // Initialize all web workers for maximum performance
  const { sortedIds, initData, upsertItems, deleteItems } = useDataWorker();
  const { flash, fadeIn, fadeOut } = useAnimationWorker();
  const webSocketWorker = useWebSocketWorker();
  const connectionWorker = useConnectionWorker();
  const jsonWorker = useJsonWorker();
  // Performance monitoring disabled by default - set to true to enable
  const performanceMonitor = usePerformanceMonitor(false);

  // Configure connection worker on component init
  connectionWorker.configure({
    baseUrl: new URL(getClusterApiGraphQLEndpoint()).origin,
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000
  });

  // Optional: Enable performance monitoring for development
  // createEffect(() => {
  //   performanceMonitor.recordWorkerOperation('http');
  //   performanceMonitor.recordWorkerOperation('json');
  // }, []);

  const query = createQuery(() => ({
    queryKey: ['log-metadata', namespace()],
    queryFn: () => fetchLogMetadataListWithWorker(connectionWorker, namespace(), jsonWorker, performanceMonitor),
    refetchOnWindowFocus: false,
  }));

  // initialize rows from initial query (reset to server list)
  createEffect(() => {
    const startTime = performanceMonitor.startTimer();
    
    const items = query.data ?? [];
    const next: { [id: string]: Row } = {};
    for (const item of items) {
      next[item.id] = {
        ...item,
        lastModifiedAtDate: item.fileInfo.lastModifiedAt ? new Date(item.fileInfo.lastModifiedAt) : null,
      };
    }

    batch(() => {
      setRows(reconcile(next));
      // Initialize web worker with data - sorting happens in worker
      initData(items);
      if (performanceMonitor.enabled) {
        performanceMonitor.recordWorkerOperation('data');
        // Track main thread time for this operation
        performanceMonitor.recordMainThreadTime(startTime);
      }
      // Reset row refs since the DOM will be rebuilt against the new dataset
      rowRefs.clear();
    });
  });

  // subscribe for live updates using WebSocket worker (re-subscribe when namespace changes)
  createEffect(() => {
    const ns = namespace();
    // Micro-batch incoming GraphQL events every 2 seconds
    const pendingUpserts = new Map<string, LogMetadata>();
    const pendingDeletes = new Set<string>();

    const flushNow = () => {
      const startTime = performanceMonitor.enabled ? performanceMonitor.startTimer() : 0;
      const changedIDs: string[] = [];
      const removedIDs: string[] = [];
      
      batch(() => {
        // Apply deletes first
        if (pendingDeletes.size) {
          pendingDeletes.forEach((id) => {
            if (rows[id]) {
              setRows(id, undefined);
              removedIDs.push(id);
            }
          });
        }

        // Apply upserts
        if (pendingUpserts.size) {
          pendingUpserts.forEach((obj, id) => {
            const existing = rows[id];
            const newDate = obj.fileInfo.lastModifiedAt ? new Date(obj.fileInfo.lastModifiedAt) : null;
            if (existing) {
              const prevTime = existing.lastModifiedAtDate?.getTime() ?? 0;
              const nextTime = newDate?.getTime() ?? 0;
              const sizeChanged = obj.fileInfo.size !== existing.fileInfo.size;
              const timeChanged = nextTime !== prevTime;
              if (sizeChanged) setRows(id, 'fileInfo', 'size', obj.fileInfo.size as any);
              if (timeChanged) setRows(id, 'lastModifiedAtDate', newDate as any);
              // always refresh spec and possibly lastModifiedAt string
              setRows(id, 'spec', reconcile(obj.spec));
              if (obj.fileInfo.lastModifiedAt !== undefined) {
                // ensure reactive change for lastModifiedAt if needed
                setRows(id, 'fileInfo', 'lastModifiedAt', obj.fileInfo.lastModifiedAt as any);
              }
              if (sizeChanged || timeChanged) changedIDs.push(id);
            } else {
              setRows(id, {
                ...obj,
                lastModifiedAtDate: newDate,
              } as Row);
              changedIDs.push(id);
            }
          });
        }
      });

      // Update worker with changes - sorting happens in background
      if (pendingUpserts.size) {
        upsertItems(Array.from(pendingUpserts.values()));
        if (performanceMonitor.enabled) {
          performanceMonitor.recordWorkerOperation('data');
        }
      }
      if (pendingDeletes.size) {
        deleteItems(Array.from(pendingDeletes));
        if (performanceMonitor.enabled) {
          performanceMonitor.recordWorkerOperation('data');
        }
      }

      // Clear pending after state flush
      pendingUpserts.clear();
      const deletedNow = Array.from(pendingDeletes);
      pendingDeletes.clear();

      // Drop refs for deleted rows to allow GC
      if (deletedNow.length) {
        deletedNow.forEach((id) => rowRefs.delete(id));
      }

      // Flash rows that actually changed using animation worker
      if (changedIDs.length) {
        requestAnimationFrame(() => {
          changedIDs.forEach((id) => {
            const el = rowRefs.get(id);
            if (!el) return;
            
            // Use animation worker for flash effect
            flash(el, 800, 'flash');
            if (performanceMonitor.enabled) {
              performanceMonitor.recordWorkerOperation('animation');
            }
          });
        });
      }
      
      // Record main thread time for this batch operation
      if (performanceMonitor.enabled) {
        performanceMonitor.recordMainThreadTime(startTime);
      }
    };

    const flushTimer = window.setInterval(() => {
      if (pendingUpserts.size || pendingDeletes.size) flushNow();
    }, 2000);

    // Use WebSocket worker for real-time updates
    const httpURL = getClusterApiGraphQLEndpoint();
    const wsURL = httpURL.replace(/^http/, 'ws');
    
    const unsubscribe = webSocketWorker.subscribeGraphQL(
      wsURL,
      ['graphql-transport-ws', 'graphql-ws'],
      { query: LOG_METADATA_LIST_WATCH, variables: { namespace: ns } },
      async (msg) => {
        // Track WebSocket message processing
        if (performanceMonitor.enabled) {
          performanceMonitor.recordWorkerOperation('websocket');
        }
        
        // Use JSON worker to parse message data if it's a string
        let parsedMsg = msg;
        if (typeof msg === 'string') {
          try {
            parsedMsg = await jsonWorker.parse<LogMetadataListWatchResult>(msg);
            if (performanceMonitor.enabled) {
              performanceMonitor.recordWorkerOperation('json');
            }
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
            return;
          }
        }
        
        const event = (parsedMsg as any)?.payload?.data?.logMetadataWatch;
        if (!event) return;
        
        const { type, object } = event;
        const id = object?.id;
        if (type === 'ADDED' || type === 'MODIFIED') {
          if (!object || !id) return;
          pendingUpserts.set(id, object);
          pendingDeletes.delete(id);
        } else if (type === 'DELETED') {
          if (!id) return;
          pendingUpserts.delete(id);
          pendingDeletes.add(id);
        }
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error('WebSocket Worker error:', err);
      },
    );

    onCleanup(() => {
      clearInterval(flushTimer);
      // do a final flush to avoid leaving pending updates behind
      if (pendingUpserts.size || pendingDeletes.size) flushNow();
      unsubscribe();
    });
  });

  return (
    <div style={{ padding: '16px', 'font-family': 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' }}>
      <h1 style={{ 'font-size': '20px', 'margin-bottom': '12px' }}>Kubetail Dashboard (Solid POC)</h1>

      <div style={{ display: 'flex', gap: '8px', 'align-items': 'center', 'margin-bottom': '12px' }}>
        <label for="ns">Namespace:</label>
        <input
          id="ns"
          value={namespace()}
          onInput={(e) => setNamespace(e.currentTarget.value)}
          placeholder="Leave empty for all"
          style={{ padding: '6px 8px', border: '1px solid #ddd', 'border-radius': '4px' }}
        />
        <button
          onClick={() => query.refetch()}
          disabled={query.isLoading}
          style={{ padding: '6px 10px', border: '1px solid #ccc', 'border-radius': '4px', cursor: 'pointer' }}
        >
          Refresh
        </button>
        <Show when={query.isFetching}>
          <span style="color:#666">Fetching...</span>
        </Show>
        <Show when={webSocketWorker.isConnected()}>
          <span style="color:#4ade80">● Connected</span>
        </Show>
        <Show when={webSocketWorker.isReconnecting()}>
          <span style="color:#f59e0b">● Reconnecting...</span>
        </Show>
        <Show when={!webSocketWorker.isConnected() && !webSocketWorker.isReconnecting()}>
          <span style="color:#ef4444">● Disconnected</span>
        </Show>
        <Show when={performanceMonitor.enabled}>
          <div style={{ 'margin-left': 'auto', 'font-size': '12px', color: '#666', display: 'flex', gap: '12px' }}>
            <span>Workers: {performanceMonitor.getEfficiencyRatio().toFixed(1)}% offloaded</span>
            <span>Ops: {performanceMonitor.metrics().jsonParseCount}J {performanceMonitor.metrics().httpRequestCount}H {performanceMonitor.metrics().wsMessageCount}W</span>
            <span>Main: {performanceMonitor.metrics().mainThreadTime.toFixed(0)}ms</span>
            <span>Worker: {performanceMonitor.metrics().workerTime.toFixed(0)}ms</span>
          </div>
        </Show>
      </div>

      <div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', border: '1px solid #eee' }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #eee' }}>Node</th>
              <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #eee' }}>Namespace</th>
              <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #eee' }}>Pod</th>
              <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #eee' }}>Container</th>
              <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #eee' }}>Container ID</th>
              <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #eee' }}>Size (bytes)</th>
              <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #eee' }}>Last Event</th>
            </tr>
          </thead>
          <tbody>
            <Show when={!query.isLoading} fallback={<tr><td colSpan={7} style={{ padding: '12px' }}>Loading...</td></tr>}>
              <For each={sortedIds()}>
                {(id) => {
                  const item = rows[id];
                  if (!item) return null as any;
                  return (
                    <tr ref={(el) => rowRefs.set(id, el)} class={`row-${id}`}>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f3f3f3' }}>{item.spec.nodeName}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f3f3f3' }}>{item.spec.namespace}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f3f3f3' }}>{item.spec.podName}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f3f3f3' }}>{item.spec.containerName}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f3f3f3', 'font-family': 'monospace' }}>{item.spec.containerID}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f3f3f3', textAlign: 'right' }}>{item.fileInfo.size}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f3f3f3' }}>
                        {item.lastModifiedAtDate ? item.lastModifiedAtDate.toLocaleString() : '—'}
                      </td>
                    </tr>
                  );
                }}
              </For>
              <Show when={sortedIds().length === 0 && !query.isLoading}>
                <tr>
                  <td colSpan={7} style={{ padding: '12px', color: '#666' }}>No items</td>
                </tr>
              </Show>
            </Show>
          </tbody>
        </table>
      </div>

      <style>
        {`
        .flash { background-color: #eaffea; transition: background-color 0.8s ease; }
      `}
      </style>
    </div>
  );
}
