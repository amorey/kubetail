import { memo } from 'react';
import type { PodDerived } from '../types';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function timeAgo(ts: number): string {
  if (!ts) return '—';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

type Props = {
  rows: PodDerived[];
};

export const PodsTable = memo(function PodsTable({ rows }: Props) {
  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="muted">Pods</div>
        <div className="small">Sorted by last event, then size</div>
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 160 }}>Namespace</th>
            <th>Pod</th>
            <th style={{ width: 110 }}>Containers</th>
            <th style={{ width: 130 }}>Total Size</th>
            <th style={{ width: 140 }}>Last Event</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.uid} className={r.lastEvent ? 'flash' : undefined}>
              <td>{r.namespace}</td>
              <td>{r.name}</td>
              <td>
                <span className="pill">{r.containers.length}</span>
              </td>
              <td>{formatBytes(r.totalSize)}</td>
              <td>{timeAgo(r.lastEvent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

