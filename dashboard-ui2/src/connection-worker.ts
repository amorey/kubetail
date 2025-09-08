// Web Worker for centralized connection management
// Handles connection pooling, retry logic, and request batching

export type ConnectionConfig = {
  baseUrl: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
};

export type HttpRequest = {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
};

export type ConnectionWorkerMessage = 
  | { type: 'CONFIG'; config: ConnectionConfig }
  | { type: 'HTTP_REQUEST'; request: HttpRequest }
  | { type: 'BATCH_REQUESTS'; requests: HttpRequest[] }
  | { type: 'CANCEL_REQUEST'; id: string };

export type ConnectionWorkerResponse = 
  | { type: 'HTTP_RESPONSE'; id: string; status: number; headers: Record<string, string>; body: string }
  | { type: 'HTTP_ERROR'; id: string; error: string; status?: number }
  | { type: 'REQUEST_CANCELLED'; id: string }
  | { type: 'CONFIG_UPDATED' };

let config: ConnectionConfig = {
  baseUrl: '',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000
};

const activeRequests = new Map<string, AbortController>();

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const makeRequest = async (request: HttpRequest, attempt = 1): Promise<void> => {
  const { id, method, url, headers = {}, body, timeout = config.timeout } = request;
  
  try {
    const controller = new AbortController();
    activeRequests.set(id, controller);
    
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const fullUrl = url.startsWith('http') ? url : `${config.baseUrl}${url}`;
    
    const response = await fetch(fullUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    activeRequests.delete(id);
    
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    
    const responseBody = await response.text();
    
    self.postMessage({
      type: 'HTTP_RESPONSE',
      id,
      status: response.status,
      headers: responseHeaders,
      body: responseBody
    } as ConnectionWorkerResponse);
    
  } catch (error) {
    activeRequests.delete(id);
    
    if (error instanceof Error && error.name === 'AbortError') {
      self.postMessage({
        type: 'REQUEST_CANCELLED',
        id
      } as ConnectionWorkerResponse);
      return;
    }
    
    // Retry logic
    if (attempt < (config.retryAttempts || 1)) {
      await delay(config.retryDelay || 1000);
      return makeRequest(request, attempt + 1);
    }
    
    self.postMessage({
      type: 'HTTP_ERROR',
      id,
      error: error instanceof Error ? error.message : 'Unknown error',
      status: error instanceof Error && 'status' in error ? (error as any).status : undefined
    } as ConnectionWorkerResponse);
  }
};

const cancelRequest = (id: string) => {
  const controller = activeRequests.get(id);
  if (controller) {
    controller.abort();
    activeRequests.delete(id);
  }
};

const processBatchRequests = async (requests: HttpRequest[]) => {
  // Process requests in parallel with connection pooling
  const promises = requests.map(request => makeRequest(request));
  await Promise.allSettled(promises);
};

const processMessage = (event: MessageEvent<ConnectionWorkerMessage>) => {
  const { type } = event.data;
  
  switch (type) {
    case 'CONFIG': {
      const { config: newConfig } = event.data;
      config = { ...config, ...newConfig };
      self.postMessage({
        type: 'CONFIG_UPDATED'
      } as ConnectionWorkerResponse);
      break;
    }
    
    case 'HTTP_REQUEST': {
      const { request } = event.data;
      makeRequest(request);
      break;
    }
    
    case 'BATCH_REQUESTS': {
      const { requests } = event.data;
      processBatchRequests(requests);
      break;
    }
    
    case 'CANCEL_REQUEST': {
      const { id } = event.data;
      cancelRequest(id);
      break;
    }
    
    default:
      self.postMessage({
        type: 'HTTP_ERROR',
        id: '',
        error: `Unknown message type: ${(event.data as any).type}`
      } as ConnectionWorkerResponse);
  }
};

self.addEventListener('message', processMessage);