// Example showing how to integrate all web workers for maximum performance
// This demonstrates the recommended usage patterns

import { useJsonWorker } from './use-json-worker';
import { useConnectionWorker } from './use-connection-worker';
import { useWebSocketWorker } from './use-websocket-worker';
import { useAnimationWorker } from './use-animation-worker';
import { useDataWorker } from './use-data-worker';
import { getClusterApiGraphQLEndpoint, LOG_METADATA_LIST_FETCH, LOG_METADATA_LIST_WATCH } from './graphql';

export function useOptimizedKubetailDashboard() {
  // Initialize all workers
  const jsonWorker = useJsonWorker();
  const connectionWorker = useConnectionWorker();
  const webSocketWorker = useWebSocketWorker();
  const animationWorker = useAnimationWorker();
  const dataWorker = useDataWorker();

  // Configure connection worker with GraphQL endpoint
  const endpoint = getClusterApiGraphQLEndpoint();
  connectionWorker.configure({
    baseUrl: new URL(endpoint).origin,
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000
  });

  // High-performance GraphQL fetch using connection worker + JSON worker
  const fetchLogMetadataOptimized = async (namespace = '') => {
    const body = { query: LOG_METADATA_LIST_FETCH, variables: { namespace } };
    
    // Use connection worker for HTTP request
    const response = await connectionWorker.post(endpoint, body, {
      headers: { 'content-type': 'application/json' }
    });
    
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    // Use JSON worker for parsing (for large responses)
    const json = await jsonWorker.parse(response.body);
    
    if ((json as any).errors) {
      throw new Error('GraphQL error');
    }
    
    return (json as any).data?.logMetadataList?.items ?? [];
  };

  // Optimized WebSocket subscription using WebSocket worker
  const subscribeOptimized = (namespace: string, onMessage: Function, onError?: Function) => {
    const httpURL = getClusterApiGraphQLEndpoint();
    const wsURL = httpURL.replace(/^http/, 'ws');
    
    return webSocketWorker.subscribeGraphQL(
      wsURL,
      ['graphql-transport-ws', 'graphql-ws'],
      { query: LOG_METADATA_LIST_WATCH, variables: { namespace } },
      onMessage,
      onError
    );
  };

  // Optimized row animation using animation worker
  const flashRow = (element: HTMLElement) => {
    return animationWorker.flash(element, 800, 'flash');
  };

  // Batch operations for better performance
  const processBatchUpdates = async (updates: any[], deletes: string[]) => {
    // Use data worker for sorting/processing
    if (updates.length) {
      dataWorker.upsertItems(updates);
    }
    if (deletes.length) {
      dataWorker.deleteItems(deletes);
    }
    
    // Use animation worker for coordinated visual updates
    updates.forEach((_, index) => {
      // Stagger animations slightly for visual appeal
      setTimeout(() => {
        const element = document.getElementById(`row-${updates[index]?.id}`);
        if (element) {
          animationWorker.flash(element as HTMLElement, 600);
        }
      }, index * 50);
    });
  };

  return {
    // Core data operations
    fetchLogMetadataOptimized,
    subscribeOptimized,
    processBatchUpdates,
    
    // Animation helpers
    flashRow,
    fadeIn: animationWorker.fadeIn,
    fadeOut: animationWorker.fadeOut,
    
    // Data processing
    sortedIds: dataWorker.sortedIds,
    initData: dataWorker.initData,
    
    // Network utilities
    httpRequest: connectionWorker.post,
    batchRequests: connectionWorker.batchRequests,
    
    // JSON processing
    parseJson: jsonWorker.parse,
    stringifyJson: jsonWorker.stringify,
    
    // Connection status
    isConnected: webSocketWorker.isConnected,
    isReconnecting: webSocketWorker.isReconnecting,
    
    // Performance tuning
    setAnimationFrameRate: animationWorker.setFrameRate,
    configureConnection: connectionWorker.configure
  };
}

// Usage example:
export function exampleUsage() {
  const kubetail = useOptimizedKubetailDashboard();
  
  // Fetch initial data with full optimization
  kubetail.fetchLogMetadataOptimized('default').then(items => {
    kubetail.initData(items);
  });
  
  // Subscribe to real-time updates
  const unsubscribe = kubetail.subscribeOptimized(
    'default',
    (message) => {
      // Process message and update UI
      console.log('Optimized message:', message);
    },
    (error) => {
      console.error('Connection error:', error);
    }
  );
  
  // Batch multiple operations for efficiency
  kubetail.processBatchUpdates(
    [/* updated items */],
    [/* deleted IDs */]
  );
  
  // Cleanup
  return unsubscribe;
}