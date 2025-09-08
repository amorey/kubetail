import { createEffect, createMemo, createSignal, onCleanup, Show, For, batch, untrack } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { createQuery } from '@tanstack/solid-query';
import {
  LOG_METADATA_LIST_FETCH,
  LOG_METADATA_LIST_WATCH,
  fetchLogMetadataList,
  type LogMetadata,
  type LogMetadataListWatchResult,
} from './graphql';
import { subscribeGraphQL } from './ws';

type Row = LogMetadata & { lastModifiedAtDate?: Date | null };

export default function App() {
  const [namespace, setNamespace] = createSignal<string>('');

  // fine-grained store keyed by id
  const [rows, setRows] = createStore<{ [id: string]: Row | undefined }>({});
  // per-row element refs (avoid querySelectorAll)
  const rowRefs = new Map<string, HTMLTableRowElement>();
  // maintain a sorted list of ids (latest lastModifiedAt first)
  const [sortedIds, setSortedIds] = createSignal<string[]>([]);

  const getRowTime = (id: string) =>
    untrack(() => {
      const r = rows[id];
      return r?.lastModifiedAtDate?.getTime() ?? 0;
    });

  const findInsertIndexDesc = (arr: string[], id: string) => {
    const t = getRowTime(id);
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const mt = getRowTime(arr[mid]);
      if (t > mt || (t === mt && id < arr[mid])) hi = mid; else lo = mid + 1;
    }
    return lo;
  };

  const query = createQuery(() => ({
    queryKey: ['log-metadata', namespace()],
    queryFn: () => fetchLogMetadataList(namespace()),
    refetchOnWindowFocus: false,
  }));

  // initialize rows from initial query (reset to server list)
  createEffect(() => {
    const items = query.data ?? [];
    const next: { [id: string]: Row } = {};
    for (const item of items) {
      next[item.id] = {
        ...item,
        lastModifiedAtDate: item.fileInfo.lastModifiedAt ? new Date(item.fileInfo.lastModifiedAt) : null,
      };
    }
    const ids = Object.keys(next);
    ids.sort((a, b) => {
      const bt = next[b]?.lastModifiedAtDate?.getTime() ?? 0;
      const at = next[a]?.lastModifiedAtDate?.getTime() ?? 0;
      if (bt !== at) return bt - at;
      return a < b ? -1 : a > b ? 1 : 0;
    });

    batch(() => {
      setRows(reconcile(next));
      setSortedIds(ids);
      // Reset row refs since the DOM will be rebuilt against the new dataset
      rowRefs.clear();
    });
  });

  // subscribe for live updates (re-subscribe when namespace changes)
  createEffect(() => {
    const ns = namespace();
    // Micro-batch incoming GraphQL events every 2 seconds
    const pendingUpserts = new Map<string, LogMetadata>();
    const pendingDeletes = new Set<string>();

    const flushNow = () => {
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

        // Incremental reorder of sorted ids
        setSortedIds((prev) => {
          let arr = prev.slice();
          if (removedIDs.length) {
            const removedSet = new Set(removedIDs);
            arr = arr.filter((id) => !removedSet.has(id));
          }
          if (changedIDs.length) {
            const seen = new Set<string>();
            for (const id of changedIDs) {
              if (seen.has(id)) continue;
              seen.add(id);
              const idx = arr.indexOf(id);
              if (idx >= 0) arr.splice(idx, 1);
              const insertAt = findInsertIndexDesc(arr, id);
              arr.splice(insertAt, 0, id);
            }
          }
          return arr;
        });
      });

      // Clear pending after state flush
      pendingUpserts.clear();
      const deletedNow = Array.from(pendingDeletes);
      pendingDeletes.clear();

      // Drop refs for deleted rows to allow GC
      if (deletedNow.length) {
        deletedNow.forEach((id) => rowRefs.delete(id));
      }

      // Flash rows that actually changed (after DOM updates)
      if (changedIDs.length) {
        requestAnimationFrame(() => {
          changedIDs.forEach((id) => {
              const el = rowRefs.get(id);
              if (!el) return;
              el.classList.remove('flash');
            // restart animation
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            (el as HTMLElement).offsetWidth;
            el.classList.add('flash');
            const onEnd = () => {
              el.classList.remove('flash');
              el.removeEventListener('animationend', onEnd);
            };
            el.addEventListener('animationend', onEnd, { once: true });
          });
        });
      }
    };

    const flushTimer = window.setInterval(() => {
      if (pendingUpserts.size || pendingDeletes.size) flushNow();
    }, 2000);

    const unsubscribe = subscribeGraphQL<LogMetadataListWatchResult>(
      { query: LOG_METADATA_LIST_WATCH, variables: { namespace: ns } },
      (msg) => {
        const event = msg.payload?.data?.logMetadataWatch;
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
        // Optionally log
        // eslint-disable-next-line no-console
        console.error('WS error', err);
      },
    );

    onCleanup(() => {
      clearInterval(flushTimer);
      // do a final flush to avoid leaving pending updates behind
      if (pendingUpserts.size || pendingDeletes.size) flushNow();
      unsubscribe();
    });
  });

  // no global full resort each update; we use incremental updates + sortedIds

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
                      <td style={{ padding: '8px', borderBottom: '1px solid #f3f3f3' }}>{rows[id]!.spec.nodeName}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f3f3f3' }}>{rows[id]!.spec.namespace}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f3f3f3' }}>{rows[id]!.spec.podName}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f3f3f3' }}>{rows[id]!.spec.containerName}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f3f3f3', 'font-family': 'monospace' }}>{rows[id]!.spec.containerID}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f3f3f3', textAlign: 'right' }}>{rows[id]!.fileInfo.size}</td>
                      <td style={{ padding: '8px', borderBottom: '1px solid #f3f3f3' }}>
                        {rows[id]!.lastModifiedAtDate ? rows[id]!.lastModifiedAtDate!.toLocaleString() : '—'}
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
