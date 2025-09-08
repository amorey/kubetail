// Web Worker for CPU-intensive data processing operations
// Handles sorting, filtering, and batch processing of log metadata

export type LogMetadataWorkerData = {
  id: string;
  spec: {
    nodeName: string;
    namespace: string;
    podName: string;
    containerName: string;
    containerID: string;
  };
  fileInfo: {
    size: number;
    lastModifiedAt?: string;
  };
  lastModifiedAtDate?: number; // timestamp for efficient sorting
};

export type WorkerMessage = 
  | { type: 'INIT'; payload: { [id: string]: LogMetadataWorkerData } }
  | { type: 'UPSERT'; payload: { [id: string]: LogMetadataWorkerData } }
  | { type: 'DELETE'; payload: { ids: string[] } }
  | { type: 'GET_SORTED_IDS'; payload?: never };

export type WorkerResponse = 
  | { type: 'SORTED_IDS'; payload: { ids: string[]; changes: { upserted: string[]; deleted: string[] } } }
  | { type: 'ERROR'; payload: { message: string } };

// Worker state
let dataStore: { [id: string]: LogMetadataWorkerData } = {};
let lastSortedIds: string[] = [];

const getRowTime = (data: LogMetadataWorkerData): number => {
  return data.lastModifiedAtDate ?? 0;
};

const findInsertIndexDesc = (arr: string[], id: string): number => {
  const data = dataStore[id];
  if (!data) return arr.length;
  
  const t = getRowTime(data);
  let lo = 0;
  let hi = arr.length;
  
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const midData = dataStore[arr[mid]];
    if (!midData) {
      hi = mid;
      continue;
    }
    
    const mt = getRowTime(midData);
    if (t > mt || (t === mt && id < arr[mid])) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
};

const computeSortedIds = (changedIds: string[] = [], deletedIds: string[] = []): string[] => {
  let arr = lastSortedIds.slice();
  
  // Remove deleted items
  if (deletedIds.length) {
    const deletedSet = new Set(deletedIds);
    arr = arr.filter(id => !deletedSet.has(id));
  }
  
  // Re-insert changed items in correct position
  if (changedIds.length) {
    const seen = new Set<string>();
    for (const id of changedIds) {
      if (seen.has(id) || !dataStore[id]) continue;
      seen.add(id);
      
      // Remove existing position
      const existingIdx = arr.indexOf(id);
      if (existingIdx >= 0) {
        arr.splice(existingIdx, 1);
      }
      
      // Insert in correct position
      const insertAt = findInsertIndexDesc(arr, id);
      arr.splice(insertAt, 0, id);
    }
  }
  
  return arr;
};

const processMessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;
  
  try {
    switch (type) {
      case 'INIT': {
        dataStore = { ...payload };
        // Sort all IDs by timestamp descending
        const allIds = Object.keys(dataStore);
        allIds.sort((a, b) => {
          const dataA = dataStore[a];
          const dataB = dataStore[b];
          const timeB = getRowTime(dataB);
          const timeA = getRowTime(dataA);
          if (timeB !== timeA) return timeB - timeA;
          return a < b ? -1 : a > b ? 1 : 0;
        });
        lastSortedIds = allIds;
        
        self.postMessage({
          type: 'SORTED_IDS',
          payload: { ids: allIds, changes: { upserted: allIds, deleted: [] } }
        } as WorkerResponse);
        break;
      }
      
      case 'UPSERT': {
        const upsertedIds = Object.keys(payload);
        // Update store
        Object.assign(dataStore, payload);
        
        // Recompute sorted order
        const newSortedIds = computeSortedIds(upsertedIds);
        lastSortedIds = newSortedIds;
        
        self.postMessage({
          type: 'SORTED_IDS',
          payload: { ids: newSortedIds, changes: { upserted: upsertedIds, deleted: [] } }
        } as WorkerResponse);
        break;
      }
      
      case 'DELETE': {
        const { ids: deleteIds } = payload;
        // Remove from store
        for (const id of deleteIds) {
          delete dataStore[id];
        }
        
        // Recompute sorted order
        const newSortedIds = computeSortedIds([], deleteIds);
        lastSortedIds = newSortedIds;
        
        self.postMessage({
          type: 'SORTED_IDS',
          payload: { ids: newSortedIds, changes: { upserted: [], deleted: deleteIds } }
        } as WorkerResponse);
        break;
      }
      
      case 'GET_SORTED_IDS': {
        self.postMessage({
          type: 'SORTED_IDS',
          payload: { ids: lastSortedIds, changes: { upserted: [], deleted: [] } }
        } as WorkerResponse);
        break;
      }
      
      default:
        self.postMessage({
          type: 'ERROR',
          payload: { message: `Unknown message type: ${(event.data as any).type}` }
        } as WorkerResponse);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      payload: { message: error instanceof Error ? error.message : 'Unknown error' }
    } as WorkerResponse);
  }
};

self.addEventListener('message', processMessage);