# Web Frontend

The web frontend is a Svelte operator surface for the local CLOG runtime.

Current responsibilities:

- threaded chat against the runtime HTTP API
- runtime summary and integration status
- monitor-cycle controls and activity feed
- fast local iteration through the launcher-managed Vite dev server

Development notes:

- `bun run dev` at the repo root launches the runtime chooser
- choosing `2` starts the web UI with hot reload on `http://127.0.0.1:4173`
- the Vite dev server proxies `/api`, `/healthz`, and `/ws` to the runtime backend
- `bun run web:build` builds the production bundle served by the runtime at `/`
