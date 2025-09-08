import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { FileInfo, LogMetadataEvent, Pod, PodDerived, UID } from './types';

// State is split into two maps for efficiency:
// - containerInfo: per-container FileInfo (aggregated total size and latest timestamp)
// - pods: stable pod data + derived fields updated from containerInfo

type ContainerInfoMap = Map<string, FileInfo>;

type PodMap = Map<UID, PodDerived>;

type State = {
  containerInfo: ContainerInfoMap;
  pods: PodMap;
  // sorted list of pod UIDs by lastEvent desc, then totalSize desc
  sortedUIDs: UID[];
};

type Action =
  | { type: 'init'; pods: Pod[] }
  | { type: 'log'; event: LogMetadataEvent }
  | { type: 'deleteContainer'; containerID: string };

function toDerived(pod: Pod, containerInfo: ContainerInfoMap): PodDerived {
  let totalSize = 0;
  let lastEvent = 0;
  for (const c of pod.containers) {
    const info = containerInfo.get(c.id);
    if (info) {
      totalSize += info.size;
      if (info.lastModifiedAt > lastEvent) lastEvent = info.lastModifiedAt;
    }
  }
  return { uid: pod.uid, namespace: pod.namespace, name: pod.name, totalSize, lastEvent, containers: pod.containers };
}

function sortUIDs(pods: PodMap): UID[] {
  return Array.from(pods.values())
    .sort((a, b) => {
      if (b.lastEvent !== a.lastEvent) return b.lastEvent - a.lastEvent;
      return b.totalSize - a.totalSize;
    })
    .map((p) => p.uid);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'init': {
      const containerInfo: ContainerInfoMap = new Map();
      const pods: PodMap = new Map();
      for (const p of action.pods) pods.set(p.uid, toDerived(p, containerInfo));
      return { containerInfo, pods, sortedUIDs: sortUIDs(pods) };
    }
    case 'log': {
      const { containerID, fileInfo } = action.event;
      // Treat size as absolute; keep latest lastModifiedAt
      const prev = state.containerInfo.get(containerID);
      const updated: FileInfo = {
        size: fileInfo.size,
        lastModifiedAt: Math.max(prev?.lastModifiedAt ?? 0, fileInfo.lastModifiedAt),
      };
      const containerInfo: ContainerInfoMap = new Map(state.containerInfo);
      containerInfo.set(containerID, updated);

      // Only update pods that contain this container id.
      // We scan pods cheaply; for POC scale this is fine and avoids extra indices.
      let anyChanged = false;
      let pods: PodMap = state.pods;
      for (const p of state.pods.values()) {
        if (p.containers.some((c) => c.id === containerID)) {
          const derived = toDerived(p, containerInfo);
          // Replace only if derived changed to keep references stable.
          if (derived.totalSize !== p.totalSize || derived.lastEvent !== p.lastEvent) {
            if (!anyChanged) pods = new Map(state.pods);
            pods.set(p.uid, derived);
            anyChanged = true;
          }
        }
      }

      const sortedUIDs = anyChanged ? sortUIDs(pods) : state.sortedUIDs;
      return { containerInfo, pods, sortedUIDs };
    }
    case 'deleteContainer': {
      if (!state.containerInfo.has(action.containerID)) return state;
      const containerInfo: ContainerInfoMap = new Map(state.containerInfo);
      containerInfo.delete(action.containerID);
      let anyChanged = false;
      let pods: PodMap = state.pods;
      for (const p of state.pods.values()) {
        if (p.containers.some((c) => c.id === action.containerID)) {
          const derived = toDerived(p, containerInfo);
          if (derived.totalSize !== p.totalSize || derived.lastEvent !== p.lastEvent) {
            if (!anyChanged) pods = new Map(state.pods);
            pods.set(p.uid, derived);
            anyChanged = true;
          }
        }
      }
      const sortedUIDs = anyChanged ? sortUIDs(pods) : state.sortedUIDs;
      return { containerInfo, pods, sortedUIDs };
    }
    default:
      return state;
  }
}

export function usePodsState(podsInput: Pod[]) {
  const initial = useMemo<State>(() => ({ containerInfo: new Map(), pods: new Map(), sortedUIDs: [] }), []);
  const [state, dispatch] = useReducer(reducer, initial);

  // Initialize on first mount or when podsInput identity changes
  useEffect(() => {
    dispatch({ type: 'init', pods: podsInput });
  }, [podsInput]);

  const podsInOrder: PodDerived[] = useMemo(() => state.sortedUIDs.map((uid) => state.pods.get(uid)!).filter(Boolean), [state.sortedUIDs, state.pods]);

  const applyEvent = useCallback((event: LogMetadataEvent) => dispatch({ type: 'log', event }), [dispatch]);
  const deleteContainer = useCallback((containerID: string) => dispatch({ type: 'deleteContainer', containerID }), [dispatch]);

  return { podsInOrder, applyEvent, deleteContainer };
}
