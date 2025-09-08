// Minimal GraphQL helpers for queries
import { joinPaths, getBasename } from './util';

export type LogMetadata = {
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
    lastModifiedAt?: string | null;
  };
};

export type LogMetadataListFetchResult = {
  logMetadataList?: {
    items: LogMetadata[];
  } | null;
};

export type LogMetadataWatchEvent = {
  type: string;
  object?: LogMetadata | null;
};

export type LogMetadataListWatchResult = {
  logMetadataWatch?: LogMetadataWatchEvent | null;
};

export const LOG_METADATA_LIST_FETCH = /* GraphQL */ `
  query LogMetadataListFetch($namespace: String = "") {
    logMetadataList(namespace: $namespace) {
      items {
        id
        spec { nodeName namespace podName containerName containerID }
        fileInfo { size lastModifiedAt }
      }
    }
  }
`;

export const LOG_METADATA_LIST_WATCH = /* GraphQL */ `
  subscription LogMetadataListWatch($namespace: String = "") {
    logMetadataWatch(namespace: $namespace) {
      type
      object {
        id
        spec { nodeName namespace podName containerName containerID }
        fileInfo { size lastModifiedAt }
      }
    }
  }
`;

export function getClusterApiGraphQLEndpoint() {
  const base = getBasename();
  // Desktop proxy expects: /cluster-api-proxy/:kubeContext/:namespace/:serviceName/graphql
  // Use kubeContext=minikube, namespace=kubetail-system, serviceName=kubetail-cluster-api
  return new URL(
    joinPaths(
      base,
      'cluster-api-proxy',
      'minikube',
      'kubetail-system',
      'kubetail-cluster-api',
      'graphql',
    ),
    window.location.origin,
  ).toString();
}

// Note: This function can be used with connection worker for better performance
// See use-connection-worker.ts for worker-based HTTP requests
export async function fetchLogMetadataList(namespace = ''): Promise<LogMetadata[]> {
  const endpoint = getClusterApiGraphQLEndpoint();
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: LOG_METADATA_LIST_FETCH, variables: { namespace } }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = (await resp.json()) as { data?: LogMetadataListFetchResult; errors?: any };
  if (json.errors) throw new Error('GraphQL error');
  return json.data?.logMetadataList?.items ?? [];
}

// Worker-based version using connection worker and JSON worker
export async function fetchLogMetadataListWithWorker(
  connectionWorker: any,
  namespace = '',
  jsonWorker?: any,
  performanceMonitor?: any
): Promise<LogMetadata[]> {
  const endpoint = getClusterApiGraphQLEndpoint();
  const body = { query: LOG_METADATA_LIST_FETCH, variables: { namespace } };
  
  const response = await connectionWorker.post(endpoint, body, {
    headers: { 'content-type': 'application/json' }
  });
  
  // Track HTTP request (if monitoring enabled)
  if (performanceMonitor?.enabled) {
    performanceMonitor.recordWorkerOperation('http');
  }
  
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  // Use JSON worker for parsing if available, otherwise fallback to sync parsing
  let json: { data?: LogMetadataListFetchResult; errors?: any };
  if (jsonWorker && response.body.length > 1000) { // Use worker for large responses
    json = await jsonWorker.parse(response.body);
    if (performanceMonitor?.enabled) {
      performanceMonitor.recordWorkerOperation('json');
    }
  } else {
    json = JSON.parse(response.body);
  }
  
  if (json.errors) throw new Error('GraphQL error');
  return json.data?.logMetadataList?.items ?? [];
}

// Optimized batch fetching for multiple namespaces
export async function fetchLogMetadataListBatch(
  connectionWorker: any,
  namespaces: string[],
  jsonWorker?: any
): Promise<{ [namespace: string]: LogMetadata[] }> {
  const endpoint = getClusterApiGraphQLEndpoint();
  
  const requests = namespaces.map(namespace => ({
    method: 'POST' as const,
    url: endpoint,
    body: { query: LOG_METADATA_LIST_FETCH, variables: { namespace } },
    options: {
      headers: { 'content-type': 'application/json' }
    }
  }));
  
  const responses = await connectionWorker.batchRequests(requests);
  const results: { [namespace: string]: LogMetadata[] } = {};
  
  for (let i = 0; i < responses.length; i++) {
    const response = responses[i];
    const namespace = namespaces[i];
    
    if (response.status < 200 || response.status >= 300) {
      console.warn(`Failed to fetch data for namespace ${namespace}: HTTP ${response.status}`);
      results[namespace] = [];
      continue;
    }
    
    try {
      // Use JSON worker for parsing if available
      let json: { data?: LogMetadataListFetchResult; errors?: any };
      if (jsonWorker && response.body.length > 1000) {
        json = await jsonWorker.parse(response.body);
      } else {
        json = JSON.parse(response.body);
      }
      
      if (json.errors) {
        console.warn(`GraphQL error for namespace ${namespace}:`, json.errors);
        results[namespace] = [];
      } else {
        results[namespace] = json.data?.logMetadataList?.items ?? [];
      }
    } catch (error) {
      console.error(`Failed to parse response for namespace ${namespace}:`, error);
      results[namespace] = [];
    }
  }
  
  return results;
}
