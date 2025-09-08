// Minimal GraphQL over WebSocket (graphql-transport-ws) client
import { getClusterApiGraphQLEndpoint } from './graphql';

type StartPayload = {
  query: string;
  variables?: Record<string, unknown>;
};

export type GqlNextMessage<T = unknown> = {
  id: string;
  type: 'next';
  payload: { data?: T; errors?: unknown };
};

export type GqlCompleteMessage = { id: string; type: 'complete' };
export type GqlErrorMessage = { id?: string; type: 'error'; payload?: unknown };
export type GqlPingMessage = { type: 'ping'; payload?: unknown };
export type GqlPongMessage = { type: 'pong'; payload?: unknown };

export type Unsubscribe = () => void;

export function subscribeGraphQL<TData = unknown>(
  payload: StartPayload,
  onMessage: (msg: GqlNextMessage<TData>) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  const httpURL = getClusterApiGraphQLEndpoint();
  const wsURL = httpURL.replace(/^http/, 'ws');

  let closed = false;
  let socket: WebSocket | null = null;
  let opId = '1';
  let reconnectTimer: number | null = null;
  let protocolInUse: 'graphql-transport-ws' | 'graphql-ws' | '' = '';

  function open() {
    if (closed) return;
    socket = new WebSocket(wsURL, ['graphql-transport-ws', 'graphql-ws']);

    socket.onopen = () => {
      protocolInUse = socket?.protocol as any;
      // init
      socket?.send(JSON.stringify({ type: 'connection_init' }));
    };

    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        switch (msg.type) {
          case 'connection_ack': {
            // start subscription
            opId = String(Date.now());
            if (!closed) {
              const startType = protocolInUse === 'graphql-ws' ? 'start' : 'subscribe';
              socket?.send(JSON.stringify({ id: opId, type: startType, payload }));
            }
            break;
          }
          case 'next': // graphql-transport-ws
          case 'data': { // legacy graphql-ws
            onMessage(msg as GqlNextMessage<TData>);
            break;
          }
          case 'error': {
            onError?.(msg);
            break;
          }
          case 'connection_error': {
            onError?.(msg);
            break;
          }
          case 'complete': {
            // no-op for single subscription
            break;
          }
          case 'ping': {
            socket?.send(JSON.stringify({ type: 'pong' }));
            break;
          }
          case 'ka': {
            // keep-alive (legacy)
            break;
          }
          default:
            // ignore
            break;
        }
      } catch (e) {
        onError?.(e);
      }
    };

    socket.onclose = (ev) => {
      // eslint-disable-next-line no-console
      console.warn('WS closed', { code: ev.code, reason: ev.reason });
      if (closed) return;
      // try to reconnect after short delay
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        open();
      }, 3000);
    };

    socket.onerror = (e) => onError?.(e);
  }

  open();

  return () => {
    closed = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    try {
      if (socket && socket.readyState === WebSocket.OPEN) {
        const stopType = protocolInUse === 'graphql-ws' ? 'stop' : 'complete';
        socket.send(JSON.stringify({ id: opId, type: stopType }));
        socket.close(1000, 'client complete');
      } else if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.CLOSING)) {
        socket.close();
      }
      if (socket) {
        // drop handlers to allow GC
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
      }
    } catch {
      // ignore
    }
  };
}
