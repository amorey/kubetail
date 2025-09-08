// Web Worker for JSON processing operations
// Offloads JSON.parse and JSON.stringify from main thread

export type JsonWorkerMessage = 
  | { type: 'PARSE'; id: string; data: string }
  | { type: 'STRINGIFY'; id: string; data: unknown };

export type JsonWorkerResponse = 
  | { type: 'PARSE_RESULT'; id: string; result: unknown; error?: never }
  | { type: 'STRINGIFY_RESULT'; id: string; result: string; error?: never }
  | { type: 'ERROR'; id: string; error: string; result?: never };

const processMessage = (event: MessageEvent<JsonWorkerMessage>) => {
  const { type, id, data } = event.data;
  
  try {
    switch (type) {
      case 'PARSE': {
        const result = JSON.parse(data as string);
        self.postMessage({
          type: 'PARSE_RESULT',
          id,
          result
        } as JsonWorkerResponse);
        break;
      }
      
      case 'STRINGIFY': {
        const result = JSON.stringify(data);
        self.postMessage({
          type: 'STRINGIFY_RESULT',
          id,
          result
        } as JsonWorkerResponse);
        break;
      }
      
      default:
        self.postMessage({
          type: 'ERROR',
          id,
          error: `Unknown message type: ${(event.data as any).type}`
        } as JsonWorkerResponse);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      id,
      error: error instanceof Error ? error.message : 'Unknown error'
    } as JsonWorkerResponse);
  }
};

self.addEventListener('message', processMessage);