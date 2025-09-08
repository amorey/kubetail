import { createClient, Client, ClientOptions } from 'graphql-ws';

export async function fetchGraphQL<T>(path: string, query: string, variables?: Record<string, any>): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e: any) => e.message).join(', '));
  return body.data as T;
}

export function makeWSClient(path: string, opts?: Partial<ClientOptions>): Client {
  const url = new URL(path, window.location.origin).toString().replace(/^http/, 'ws');
  return createClient({
    url,
    keepAlive: 5000,
    retryAttempts: Infinity,
    shouldRetry: () => true,
    retryWait: async () => new Promise((r) => setTimeout(r, 1500)),
    ...opts,
  });
}

// Minimal subscribe helper that returns an unsubscribe function
export function subscribe<T>({ client, query, variables, next }: { client: Client; query: string; variables?: any; next: (val: T) => void }) {
  const dispose = client.subscribe<T>({ query, variables }, { next: (v) => next(v), error: console.error, complete: () => {} });
  return () => dispose();
}

