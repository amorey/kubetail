// Hook for managing WebSocket processing web worker
import { createSignal, onCleanup } from 'solid-js';
import type { WebSocketWorkerMessage, WebSocketWorkerResponse } from './websocket-worker';
import WebSocketWorker from './websocket-worker?worker';
import type { GqlNextMessage } from './ws';

type StartPayload = {
  query: string;
  variables?: Record<string, unknown>;
};

export type Unsubscribe = () => void;

export function useWebSocketWorker() {
  const [isConnected, setIsConnected] = createSignal(false);
  const [isReconnecting, setIsReconnecting] = createSignal(false);
  let worker: Worker | null = null;

  const initWorker = () => {
    if (worker) return worker;
    
    worker = new WebSocketWorker();
    
    worker.addEventListener('message', (event: MessageEvent<WebSocketWorkerResponse>) => {
      const { type } = event.data;
      
      switch (type) {
        case 'CONNECTED':
          setIsConnected(true);
          setIsReconnecting(false);
          break;
          
        case 'DISCONNECTED':
          setIsConnected(false);
          setIsReconnecting(false);
          break;
          
        case 'RECONNECTING':
          setIsReconnecting(true);
          break;
          
        case 'ERROR':
          console.error('WebSocket Worker error:', event.data.error);
          break;
          
        case 'MESSAGE':
          // Messages will be handled by individual subscriptions
          break;
      }
    });
    
    return worker;
  };

  const subscribeGraphQL = <TData = unknown>(
    wsUrl: string,
    protocols: string[],
    payload: StartPayload,
    onMessage: (msg: GqlNextMessage<TData>) => void,
    onError?: (err: unknown) => void,
  ): Unsubscribe => {
    const w = initWorker();
    
    // Set up message listener for this subscription
    const messageHandler = (event: MessageEvent<WebSocketWorkerResponse>) => {
      const { type, data, error } = event.data;
      
      switch (type) {
        case 'MESSAGE':
          onMessage(data as GqlNextMessage<TData>);
          break;
          
        case 'ERROR':
          onError?.(error);
          break;
      }
    };
    
    w.addEventListener('message', messageHandler);
    
    // Connect
    w.postMessage({
      type: 'CONNECT',
      url: wsUrl,
      protocols,
      payload
    } as WebSocketWorkerMessage);
    
    return () => {
      w.removeEventListener('message', messageHandler);
      w.postMessage({
        type: 'DISCONNECT'
      } as WebSocketWorkerMessage);
    };
  };

  // Send raw data to WebSocket
  const send = (data: string) => {
    if (worker) {
      worker.postMessage({
        type: 'SEND',
        data
      } as WebSocketWorkerMessage);
    }
  };

  // Cleanup
  onCleanup(() => {
    if (worker) {
      worker.postMessage({
        type: 'DISCONNECT'
      } as WebSocketWorkerMessage);
      worker.terminate();
      worker = null;
    }
  });

  return {
    subscribeGraphQL,
    send,
    isConnected,
    isReconnecting
  };
}