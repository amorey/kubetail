import { useEffect, useMemo, useState } from 'react';
import { PodsTable } from './components/PodsTable';
import { usePodsState } from './state';
import { fetchGraphQL, makeWSClient, subscribe } from './graphql';
import { CLUSTER_API_READY_WAIT, LOG_METADATA_LIST_FETCH, LOG_METADATA_LIST_WATCH, PODS_LIST, KUBE_CONFIG_GET } from './ops';
import { stripContainerRuntimePrefix } from './util';
import type { Pod } from './types';

// Stable empty array to avoid recreating deps and infinite init loops
const EMPTY_PODS: Pod[] = [];

export default function App() {
  const [pods, setPods] = useState<Pod[] | null>(null);
  const podsInput = pods ?? EMPTY_PODS;
  const { podsInOrder, applyEvent, deleteContainer } = usePodsState(podsInput);

  const [kubeContext, setKubeContext] = useState<string>('');
  const dashboardHttp = '/graphql';
  const dashboardWS = '/graphql';

  // Fetch kubeContext first
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchGraphQL<any>(dashboardHttp, KUBE_CONFIG_GET);
        const ctx = data?.kubeConfigGet?.currentContext || '';
        if (!cancelled) setKubeContext(ctx);
      } catch (e) {
        console.error('kubeConfig fetch error', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dashboardHttp]);

  // Fetch all pods (all namespaces) with pagination (after kubeContext is known)
  useEffect(() => {
    let cancelled = false;
    if (!kubeContext) return;
    (async () => {
      const acc: Pod[] = [];
      let cont = '';
      do {
        const data = await fetchGraphQL<any>(dashboardHttp, PODS_LIST, { kubeContext, namespace: '', continue: cont });
        const list = data?.coreV1PodsList;
        const items = list?.items ?? [];
        for (const it of items) {
          const containers = (it.status?.containerStatuses ?? [])
            .map((s: any) => stripContainerRuntimePrefix(s.containerID))
            .filter(Boolean)
            .map((id: string, i: number) => ({ id, name: `c${i + 1}` }));
          acc.push({ uid: it.metadata.uid, namespace: it.metadata.namespace, name: it.metadata.name, containers });
        }
        cont = list?.metadata?.continue ?? '';
      } while (cont);
      if (!cancelled) setPods(acc);
    })().catch((e) => console.error('pods fetch error', e));
    return () => {
      cancelled = true;
    };
  }, [dashboardHttp, kubeContext]);

  // Wait for Cluster API readiness via dashboard subscription, then pull + watch log metadata
  useEffect(() => {
    if (!pods || !kubeContext) return;
    let stopReady = () => {};
    let stopWatch = () => {};
    const dashClient = makeWSClient(dashboardWS);

    // Subscribe to readiness
    const readyPromise = new Promise<void>((resolve) => {
      stopReady = subscribe<{ data?: { clusterAPIReadyWait?: boolean } }>({
        client: dashClient,
        query: CLUSTER_API_READY_WAIT,
        variables: { kubeContext, namespace: 'kubetail-system', serviceName: 'kubetail-cluster-api' },
        next: (msg) => {
          const v = (msg as any)?.data?.clusterAPIReadyWait;
          if (v) resolve();
        },
      });
    });

    readyPromise
      .then(async () => {
        // Initial log metadata fetch (all namespaces)
        // Build cluster API endpoint with kubeContext path segment required by Desktop proxy
        const clusterApiPath = `/cluster-api-proxy/${encodeURIComponent(kubeContext)}/kubetail-system/kubetail-cluster-api/graphql`;
        const data = await fetchGraphQL<any>(clusterApiPath, LOG_METADATA_LIST_FETCH, { namespace: '' });
        const items = data?.logMetadataList?.items ?? [];
        for (const it of items) {
          const id = it.spec?.containerID as string;
          const sizeStr = it.fileInfo?.size ?? '0';
          const size = typeof sizeStr === 'string' ? parseInt(sizeStr, 10) : Number(sizeStr ?? 0);
          const ts = it.fileInfo?.lastModifiedAt ? new Date(it.fileInfo.lastModifiedAt).getTime() : 0;
          if (id) applyEvent({ containerID: id, fileInfo: { size, lastModifiedAt: ts } });
        }

        // Watch for changes
        stopWatch = subscribe<{ data?: { logMetadataWatch?: { type: string; object?: any } } }>({
          client: makeWSClient(clusterApiPath),
          query: LOG_METADATA_LIST_WATCH,
          variables: { namespace: '' },
          next: (msg) => {
            const ev = (msg as any)?.data?.logMetadataWatch;
            if (!ev) return;
            const id = ev.object?.spec?.containerID;
            if (!id) return;
            if (ev.type === 'DELETED') {
              deleteContainer(id);
              return;
            }
            const sizeStr = ev.object?.fileInfo?.size ?? '0';
            const size = typeof sizeStr === 'string' ? parseInt(sizeStr, 10) : Number(sizeStr ?? 0);
            const ts = ev.object?.fileInfo?.lastModifiedAt ? new Date(ev.object.fileInfo.lastModifiedAt).getTime() : 0;
            applyEvent({ containerID: id, fileInfo: { size, lastModifiedAt: ts } });
          },
        });
      })
      .catch((e) => console.error('cluster api readiness error', e));

    return () => {
      stopReady?.();
      stopWatch?.();
    };
  }, [pods, kubeContext, dashboardWS, applyEvent, deleteContainer]);

  return (
    <div className="wrap">
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>Dashboard UI 3 — Pods</h1>
        <div className="small">Ultra-minimal POC. No auth, no routing, no UI lib.</div>
      </div>
      <PodsTable rows={podsInOrder} />
    </div>
  );
}
