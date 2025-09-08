// Web Worker for WebSocket message processing
// Handles parsing, routing, and protocol management off main thread

type StartPayload = {
  query: string;
  variables?: Record<string, unknown>;
};

export type WebSocketWorkerMessage = 
  | { type: 'CONNECT'; url: string; protocols: string[]; payload: StartPayload }
  | { type: 'DISCONNECT' }
  | { type: 'SEND'; data: string };

export type WebSocketWorkerResponse = 
  | { type: 'CONNECTED'; protocol: string }
  | { type: 'MESSAGE'; data: unknown }
  | { type: 'ERROR'; error: string }
  | { type: 'DISCONNECTED'; code?: number; reason?: string }
  | { type: 'RECONNECTING' };

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let closed = false;
let protocolInUse: string = '';
let opId = '1';
let currentPayload: StartPayload | null = null;

const cleanup = () => {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  if (socket) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    socket = null;
  }
};

const connect = (url: string, protocols: string[], payload: StartPayload) => {
  if (closed) return;
  
  currentPayload = payload;
  socket = new WebSocket(url, protocols);

  socket.onopen = () => {
    protocolInUse = socket?.protocol || '';
    
    self.postMessage({
      type: 'CONNECTED',
      protocol: protocolInUse
    } as WebSocketWorkerResponse);
    
    // Send connection init
    socket?.send(JSON.stringify({ type: 'connection_init' }));
  };

  socket.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string);
      
      switch (msg.type) {
        case 'connection_ack': {
          // Start subscription
          opId = String(Date.now());
          if (!closed && currentPayload) {
            const startType = protocolInUse === 'graphql-ws' ? 'start' : 'subscribe';
            socket?.send(JSON.stringify({ 
              id: opId, 
              type: startType, 
              payload: currentPayload 
            }));
          }
          break;
        }
        case 'next': // graphql-transport-ws
        case 'data': { // legacy graphql-ws
          self.postMessage({
            type: 'MESSAGE',
            data: msg
          } as WebSocketWorkerResponse);
          break;
        }
        case 'error':
        case 'connection_error': {
          self.postMessage({
            type: 'ERROR',
            error: JSON.stringify(msg)
          } as WebSocketWorkerResponse);
          break;
        }
        case 'ping': {
          socket?.send(JSON.stringify({ type: 'pong' }));
          break;
        }
        case 'complete':
        case 'ka': {
          // Handle but don't forward
          break;
        }
        default:
          // Forward unknown messages
          self.postMessage({
            type: 'MESSAGE',
            data: msg
          } as WebSocketWorkerResponse);
          break;
      }
    } catch (e) {
      self.postMessage({
        type: 'ERROR',
        error: e instanceof Error ? e.message : 'JSON parse error'
      } as WebSocketWorkerResponse);
    }
  };

  socket.onclose = (ev) => {
    self.postMessage({
      type: 'DISCONNECTED',
      code: ev.code,
      reason: ev.reason
    } as WebSocketWorkerResponse);
    
    if (closed) return;
    
    // Try to reconnect after short delay
    self.postMessage({
      type: 'RECONNECTING'
    } as WebSocketWorkerResponse);
    
    reconnectTimer = self.setTimeout(() => {
      reconnectTimer = null;
      if (currentPayload) {
        connect(url, protocols, currentPayload);
      }
    }, 3000);
  };

  socket.onerror = () => {
    self.postMessage({
      type: 'ERROR',
      error: 'WebSocket connection error'
    } as WebSocketWorkerResponse);
  };
};

const disconnect = () => {
  closed = true;
  cleanup();
  
  try {
    if (socket && socket.readyState === WebSocket.OPEN) {
      const stopType = protocolInUse === 'graphql-ws' ? 'stop' : 'complete';
      socket.send(JSON.stringify({ id: opId, type: stopType }));
      socket.close(1000, 'client complete');
    } else if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.CLOSING)) {
      socket.close();
    }
  } catch {
    // ignore
  }
};

const processMessage = (event: MessageEvent<WebSocketWorkerMessage>) => {
  const { type } = event.data;
  
  switch (type) {
    case 'CONNECT': {
      const { url, protocols, payload } = event.data;
      closed = false;
      connect(url, protocols, payload);
      break;
    }
    
    case 'DISCONNECT': {
      disconnect();
      break;
    }
    
    case 'SEND': {
      const { data } = event.data;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
      break;
    }
    
    default:
      self.postMessage({
        type: 'ERROR',
        error: `Unknown message type: ${(event.data as any).type}`
      } as WebSocketWorkerResponse);
  }
};

self.addEventListener('message', processMessage);