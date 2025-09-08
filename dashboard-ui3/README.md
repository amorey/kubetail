# Dashboard UI 3 (POC)

Minimal React + TypeScript + Vite app that renders a single Pods table and updates/sorts rows when simulated log metadata events arrive. No auth, routing, or heavy UI libraries. Built for low memory/CPU.

## Commands

- `pnpm i`
- `pnpm dev` — starts Vite dev server
- `pnpm build` — builds production bundle
- `pnpm preview` — serves the build locally

## Notes

- Data is mocked (`src/mockData.ts`).
- Log metadata updates are simulated (`src/eventFeed.ts`).
- Aggregation and sorting are incremental and minimal (`src/state.ts`).
- Sorting order: last event desc, then total size desc.

## Files

- `src/App.tsx` — wires state and table
- `src/components/PodsTable.tsx` — table component
- `src/state.ts` — pod/container state + aggregation
- `src/eventFeed.ts` — simulated updates
- `src/mockData.ts` — initial pods/containers
- `src/types.ts` — small type model

