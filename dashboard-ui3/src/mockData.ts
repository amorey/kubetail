import type { Pod } from './types';

// Small deterministic set of pods and containers for the demo.
export const initialPods: Pod[] = [
  {
    uid: 'pod-001',
    namespace: 'default',
    name: 'api-server-0',
    containers: [
      { id: 'ctr-001-a', name: 'api' },
      { id: 'ctr-001-b', name: 'sidecar' },
    ],
  },
  {
    uid: 'pod-002',
    namespace: 'kube-system',
    name: 'coredns-6d4b75cb6d-xyz',
    containers: [
      { id: 'ctr-002-a', name: 'coredns' },
    ],
  },
  {
    uid: 'pod-003',
    namespace: 'kubetail-system',
    name: 'kubetail-cluster-api-0',
    containers: [
      { id: 'ctr-003-a', name: 'cluster-api' },
      { id: 'ctr-003-b', name: 'metrics' },
    ],
  },
  {
    uid: 'pod-004',
    namespace: 'default',
    name: 'web-8f79db6d8c-abc',
    containers: [
      { id: 'ctr-004-a', name: 'web' },
      { id: 'ctr-004-b', name: 'logger' },
    ],
  },
];

