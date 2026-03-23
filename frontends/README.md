# Frontends

This folder is intentionally reserved for transport adapters that speak the shared runtime surface instead of inventing their own contracts.

Planned clients:

- `web/`
- `telegram/`
- `cli/`

Each frontend should treat `apps/clog` as the authority and `@clog/types` as the stable interface.

The Telegram adapter boots first and uses the Vercel Chat SDK stub in `packages/vercel-chat` as the outbound notifier. GUI and CLI adapters can be added later without touching the runtime surface.
