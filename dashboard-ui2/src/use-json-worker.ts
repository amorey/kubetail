// Hook for managing JSON processing web worker
import { onCleanup } from 'solid-js';
import type { JsonWorkerMessage, JsonWorkerResponse } from './json-worker';
import JsonWorker from './json-worker?worker';

export function useJsonWorker() {
  let worker: Worker | null = null;
  let requestId = 0;
  const pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();

  const initWorker = () => {
    if (worker) return worker;
    
    worker = new JsonWorker();
    
    worker.addEventListener('message', (event: MessageEvent<JsonWorkerResponse>) => {
      const { type, id, result, error } = event.data;
      const pending = pendingRequests.get(id);
      
      if (!pending) return;
      
      pendingRequests.delete(id);
      
      if (error) {
        pending.reject(new Error(error));
      } else {
        switch (type) {
          case 'PARSE_RESULT':
          case 'STRINGIFY_RESULT':
            pending.resolve(result);
            break;
          default:
            pending.reject(new Error('Unknown response type'));
        }
      }
    });
    
    return worker;
  };

  const parse = <T = unknown>(jsonString: string): Promise<T> => {
    return new Promise((resolve, reject) => {
      const id = String(++requestId);
      const w = initWorker();
      
      pendingRequests.set(id, { resolve: resolve as any, reject });
      
      w.postMessage({
        type: 'PARSE',
        id,
        data: jsonString
      } as JsonWorkerMessage);
    });
  };

  const stringify = (data: unknown): Promise<string> => {
    return new Promise((resolve, reject) => {
      const id = String(++requestId);
      const w = initWorker();
      
      pendingRequests.set(id, { resolve: resolve as any, reject });
      
      w.postMessage({
        type: 'STRINGIFY',
        id,
        data
      } as JsonWorkerMessage);
    });
  };

  // Synchronous fallbacks for cases where async isn't suitable
  const parseSync = <T = unknown>(jsonString: string): T => {
    return JSON.parse(jsonString);
  };

  const stringifySync = (data: unknown): string => {
    return JSON.stringify(data);
  };

  // Cleanup
  onCleanup(() => {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    // Reject all pending requests
    pendingRequests.forEach(({ reject }) => {
      reject(new Error('Worker terminated'));
    });
    pendingRequests.clear();
  });

  return {
    parse,
    stringify,
    parseSync,
    stringifySync
  };
}