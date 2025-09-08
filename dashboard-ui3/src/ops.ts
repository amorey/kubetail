// Dashboard GraphQL operations we need

export const PODS_LIST = /* GraphQL */ `
  query HomePodsListFetch($kubeContext: String, $namespace: String = "", $continue: String = "") {
    coreV1PodsList(kubeContext: $kubeContext, namespace: $namespace, options: { limit: "100", continue: $continue }) {
      metadata { continue resourceVersion }
      items {
        metadata {
          namespace
          name
          uid
          deletionTimestamp
          ownerReferences { uid name controller }
        }
        status { containerStatuses { containerID started } }
      }
    }
  }
`;

export const CLUSTER_API_READY_WAIT = /* GraphQL */ `
  subscription ClusterAPIReadyWait($kubeContext: String!, $namespace: String!, $serviceName: String!) {
    clusterAPIReadyWait(kubeContext: $kubeContext, namespace: $namespace, serviceName: $serviceName)
  }
`;

// Cluster API GraphQL ops
export const LOG_METADATA_LIST_FETCH = /* GraphQL */ `
  query LogMetadataListFetch($namespace: String = "") {
    logMetadataList(namespace: $namespace) {
      items {
        id
        spec { containerID }
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
        spec { containerID }
        fileInfo { size lastModifiedAt }
      }
    }
  }
`;

export const KUBE_CONFIG_GET = /* GraphQL */ `
  query KubeConfigGet {
    kubeConfigGet {
      currentContext
    }
  }
`;
