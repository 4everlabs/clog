# Web Frontend

The web frontend is a Svelte operator surface for the local CLOG runtime.

Current responsibilities:

- threaded chat against the runtime HTTP API
- runtime summary and integration status
- monitor-cycle controls and activity feed
- separate operator UI served by the frontend dev server

Development notes:

- `bun run dev` at the repo root launches the runtime chooser
- choosing `2` starts the web UI on `http://127.0.0.1:4173`
- the Vite dev server proxies `/api`, `/healthz`, and `/ws` to the runtime backend on `6900`
- the runtime serves API and websocket endpoints only; it does not serve the web UI
- `bun run web` starts the standalone frontend dev server
- `bun run web:build` still builds the frontend bundle for static output when needed
