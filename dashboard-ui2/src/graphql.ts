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
