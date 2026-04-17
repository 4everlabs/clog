# Web Frontend

The web frontend is a Svelte operator surface for the local CLOG runtime.

Current responsibilities:

- threaded chat against the runtime HTTP API
- runtime summary and integration status
- monitor-cycle controls and activity feed
- runtime-served operator UI on the same local origin as the backend

Development notes:

- `bun run dev` at the repo root launches the runtime chooser
- choosing `2` builds the web UI and opens it on `http://127.0.0.1:6900`
- the runtime serves both the web bundle and `/api` endpoints from the same origin
- `bun run web` watches and rebuilds the frontend bundle while the runtime keeps serving it on `6900`
- `bun run web:build` builds the bundle served by the runtime at `/`
