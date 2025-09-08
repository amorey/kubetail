# Kubetail Dashboard (SolidJS POC)

A minimal SolidJS-based dashboard prototype to evaluate migrating from React.

This POC focuses on a single page that fetches and live-updates `LogMetadata` via GraphQL and displays it in a simple table. It intentionally excludes auth and external UI libraries.

## Dev

- Install deps and run dev server:

```bash
pnpm i
pnpm dev
```

The app expects the backend to proxy the Cluster API under:

- `/<basePath>/cluster-api-proxy/minikube/kubetail-system/kubetail-cluster-api/graphql`

The base path is auto-detected from the current URL. The dev server proxies `/cluster-api-proxy/*` and `/graphql` to `http://localhost:$VITE_DASHBOARD_PROXY_PORT` (see `.env`).

## What it does

- Initial fetch: `query LogMetadataListFetch(namespace: String = "")`.
- Live updates: `subscription LogMetadataListWatch` over WebSocket using the `graphql-transport-ws` protocol (implemented with a tiny client, no external libs).
- Displays a table with Node, Namespace, Pod, Container, Container ID, Size, and Last Event, updating rows in real time.

## Notes

- No auth wiring. If the proxy requires authentication, you’ll need to sign in via the main app or otherwise obtain a valid session.
- No external UI libs; just plain HTML/CSS and `@tanstack/solid-query` for data management.
- GraphQL strings and a minimal WS client are embedded locally for simplicity.
