// Hook for managing connection processing web worker
import { onCleanup } from 'solid-js';
import type { 
  ConnectionConfig, 
  HttpRequest, 
  ConnectionWorkerMessage, 
  ConnectionWorkerResponse 
} from './connection-worker';
import ConnectionWorker from './connection-worker?worker';

type RequestOptions = {
  headers?: Record<string, string>;
  timeout?: number;
};

export function useConnectionWorker() {
  let worker: Worker | null = null;
  let requestId = 0;
  const pendingRequests = new Map<string, {
    resolve: (value: { status: number; headers: Record<string, string>; body: string }) => void;
    reject: (error: Error) => void;
  }>();

  const initWorker = () => {
    if (worker) return worker;
    
    worker = new ConnectionWorker();
    
    worker.addEventListener('message', (event: MessageEvent<ConnectionWorkerResponse>) => {
      const { type, id } = event.data;
      
      switch (type) {
        case 'HTTP_RESPONSE': {
          const { status, headers, body } = event.data;
          const pending = pendingRequests.get(id);
          if (pending) {
            pendingRequests.delete(id);
            pending.resolve({ status, headers, body });
          }
          break;
        }
        
        case 'HTTP_ERROR': {
          const { error, status } = event.data;
          const pending = pendingRequests.get(id);
          if (pending) {
            pendingRequests.delete(id);
            const err = new Error(error);
            if (status !== undefined) {
              (err as any).status = status;
            }
            pending.reject(err);
          }
          break;
        }
        
        case 'REQUEST_CANCELLED': {
          const pending = pendingRequests.get(id);
          if (pending) {
            pendingRequests.delete(id);
            pending.reject(new Error('Request cancelled'));
          }
          break;
        }
        
        case 'CONFIG_UPDATED': {
          // Configuration update confirmed
          break;
        }
      }
    });
    
    return worker;
  };

  const configure = (config: ConnectionConfig) => {
    const w = initWorker();
    w.postMessage({
      type: 'CONFIG',
      config
    } as ConnectionWorkerMessage);
  };

  const request = (
    method: HttpRequest['method'], 
    url: string, 
    body?: unknown,
    options: RequestOptions = {}
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> => {
    return new Promise((resolve, reject) => {
      const id = String(++requestId);
      const w = initWorker();
      
      pendingRequests.set(id, { resolve, reject });
      
      const httpRequest: HttpRequest = {
        id,
        method,
        url,
        headers: options.headers,
        body: body ? JSON.stringify(body) : undefined,
        timeout: options.timeout
      };
      
      w.postMessage({
        type: 'HTTP_REQUEST',
        request: httpRequest
      } as ConnectionWorkerMessage);
    });
  };

  const get = (url: string, options?: RequestOptions) => 
    request('GET', url, undefined, options);

  const post = (url: string, body?: unknown, options?: RequestOptions) => 
    request('POST', url, body, options);

  const put = (url: string, body?: unknown, options?: RequestOptions) => 
    request('PUT', url, body, options);

  const del = (url: string, options?: RequestOptions) => 
    request('DELETE', url, undefined, options);

  const patch = (url: string, body?: unknown, options?: RequestOptions) => 
    request('PATCH', url, body, options);

  const batchRequests = (requests: Array<{
    method: HttpRequest['method'];
    url: string;
    body?: unknown;
    options?: RequestOptions;
  }>): Promise<Array<{ status: number; headers: Record<string, string>; body: string }>> => {
    const promises = requests.map(({ method, url, body, options = {} }) => {
      const id = String(++requestId);
      const w = initWorker();
      
      return new Promise<{ status: number; headers: Record<string, string>; body: string }>((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        
        const httpRequest: HttpRequest = {
          id,
          method,
          url,
          headers: options.headers,
          body: body ? JSON.stringify(body) : undefined,
          timeout: options.timeout
        };
        
        w.postMessage({
          type: 'BATCH_REQUESTS',
          requests: [httpRequest]
        } as ConnectionWorkerMessage);
      });
    });
    
    return Promise.all(promises);
  };

  const cancel = (requestId: string) => {
    const w = worker;
    if (w) {
      w.postMessage({
        type: 'CANCEL_REQUEST',
        id: requestId
      } as ConnectionWorkerMessage);
    }
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
    configure,
    get,
    post,
    put,
    delete: del,
    patch,
    batchRequests,
    cancel
  };
}