# Frontends

This folder is intentionally reserved for transport adapters that speak the shared runtime surface instead of inventing their own contracts.

Planned clients:

- `web/`
- `slack/`
- `cli/`

Each frontend should treat `apps/clog` as the authority and `@clog/types` as the stable interface.

The Slack adapter boots first and uses the official Chat SDK with the Slack adapter as the outbound notifier. GUI and CLI adapters can be added later without touching the runtime surface. All frontends should call the guarded `/api/shell` endpoint when they need to `ls`, `rg`, `cat`, or otherwise inspect repository state; the server enforces the allow list and safe roots so the model never escapes the sandbox.
