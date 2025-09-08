// Hook for managing the data processing web worker
import { createSignal, onCleanup } from 'solid-js';
import type { LogMetadata } from './graphql';
import type { WorkerMessage, WorkerResponse, LogMetadataWorkerData } from './data-worker';
import DataWorker from './data-worker?worker';

export function useDataWorker() {
  const [sortedIds, setSortedIds] = createSignal<string[]>([]);
  const [worker, setWorker] = createSignal<Worker | null>(null);

  // Initialize worker
  const initWorker = () => {
    if (worker()) return worker()!;
    
    const newWorker = new DataWorker();
    
    newWorker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const { type, payload } = event.data;
      
      switch (type) {
        case 'SORTED_IDS':
          setSortedIds(payload.ids);
          break;
        case 'ERROR':
          console.error('Worker error:', payload.message);
          break;
      }
    });
    
    setWorker(newWorker);
    return newWorker;
  };

  // Convert LogMetadata to worker format (deep clone to avoid proxy issues)
  const toWorkerData = (items: LogMetadata[]): { [id: string]: LogMetadataWorkerData } => {
    const result: { [id: string]: LogMetadataWorkerData } = {};
    for (const item of items) {
      // Deep clone to avoid proxy serialization issues
      result[item.id] = {
        id: item.id,
        spec: {
          nodeName: item.spec.nodeName,
          namespace: item.spec.namespace,
          podName: item.spec.podName,
          containerName: item.spec.containerName,
          containerID: item.spec.containerID,
        },
        fileInfo: {
          size: item.fileInfo.size,
          lastModifiedAt: item.fileInfo.lastModifiedAt,
        },
        lastModifiedAtDate: item.fileInfo.lastModifiedAt 
          ? new Date(item.fileInfo.lastModifiedAt).getTime() 
          : undefined
      };
    }
    return result;
  };

  // Initialize data store
  const initData = (items: LogMetadata[]) => {
    const w = initWorker();
    const workerData = toWorkerData(items);
    w.postMessage({ type: 'INIT', payload: workerData } as WorkerMessage);
  };

  // Upsert items
  const upsertItems = (items: LogMetadata[]) => {
    const w = worker();
    if (!w) return;
    
    const workerData = toWorkerData(items);
    w.postMessage({ type: 'UPSERT', payload: workerData } as WorkerMessage);
  };

  // Delete items
  const deleteItems = (ids: string[]) => {
    const w = worker();
    if (!w) return;
    
    w.postMessage({ type: 'DELETE', payload: { ids } } as WorkerMessage);
  };

  // Get current sorted IDs
  const getSortedIds = () => {
    const w = worker();
    if (!w) return;
    
    w.postMessage({ type: 'GET_SORTED_IDS' } as WorkerMessage);
  };

  // Cleanup
  onCleanup(() => {
    const w = worker();
    if (w) {
      w.terminate();
      setWorker(null);
    }
  });

  return {
    sortedIds,
    initData,
    upsertItems,
    deleteItems,
    getSortedIds
  };
}