import type { LogMetadataEvent, Pod } from './types';

// Tiny event feed that simulates incoming log metadata updates.
// Designed for ultra-low overhead: a single interval and simple math.

export type Feed = {
  stop: () => void;
};

type Callback = (ev: LogMetadataEvent) => void;

export function startLogFeed(pods: Pod[], onEvent: Callback, intervalMs = 900): Feed {
  const allContainers = pods.flatMap((p) => p.containers.map((c) => ({ podUID: p.uid, container: c })));
  if (allContainers.length === 0) return { stop: () => {} };

  const timer = setInterval(() => {
    // Randomly pick a container to receive a new log write
    const idx = Math.floor(Math.random() * allContainers.length);
    const { container } = allContainers[idx];
    const sizeInc = 100 + Math.floor(Math.random() * 2000); // bytes
    const now = Date.now();

    onEvent({
      containerID: container.id,
      fileInfo: {
        size: sizeInc, // callers should aggregate into a running size
        lastModifiedAt: now,
      },
    });
  }, intervalMs);

  return { stop: () => clearInterval(timer) };
}

