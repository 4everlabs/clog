<p align="center">
  <img src="public/logo.png" alt="clog logo" width="180">
</p>

# clog

[![GitHub](https://img.shields.io/badge/GitHub-4everlabs%2Fclog-181717?logo=github)](https://github.com/4everlabs/clog)
[![Bun](https://img.shields.io/badge/Bun-1.3.11-000000?logo=bun)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Oxlint](https://img.shields.io/badge/Lint-Oxlint-111111)](https://oxc.rs/docs/guide/usage/linter.html)

`clog` is a runtime-first oversight agent for watching product and runtime health, pulling evidence from systems like PostHog, GitHub, and Vercel, and surfacing clear findings through a shared backend.

## What is here

- `apps/clog`: core runtime, gateway, monitoring loop, integrations, and AI bridge.
- `apps/types`: shared contracts consumed by every frontend.
- `apps/frontends/cli`: CLI client for the runtime.
- `apps/frontends/telegram`: Telegram transport and bridge.
- `apps/frontends/web`: web frontend placeholder.
- `docs`: architecture, runtime setup, and service docs.

## Quick start

```bash
bun install
bun run runtime
```

In another terminal:

```bash
bun run cli
```

## Common commands

```bash
bun run runtime          # start the runtime
bun run runtime --wakeup # start and run one wakeup pass immediately
bun dev --wakeup         # dev entrypoint with immediate wakeup
bun run cli              # start the CLI frontend
bun run lint             # run oxlint
bun run typecheck        # run tsc --noEmit
bun run test             # run the Bun test suite
bun run build            # bundle apps/clog to dist/
bun run ci               # lint + typecheck + test
bun run update-all       # update workspace deps to latest
```

## How it is structured

`apps/clog` is the authority. Frontends are adapters.

- `src/config.ts`: environment parsing and capability shaping.
- `src/brain/service.ts`: shared chat entrypoint used by the gateway and transports.
- `src/monitoring`: turns observations into findings.
- `src/gateway`: transport-agnostic API surface.
- `src/integrations`: PostHog, GitHub, Vercel, and other external boundaries.
- `src/execution/shell-executor.ts`: restricted read-only shell access for runtime inspection.

## Runtime layout

The runtime expects per-instance state under `.runtime/instances/<instance>/`:

- `read-only/settings.json`: runtime-owned settings.
- `read-only/tools.json`: tool visibility and enablement.
- `wakeup.json`: wakeup prompt and frequency.
- `storage/`: structured runtime state.
- `workspace/`: model-targeted writable workspace.

Secrets still belong in `.env`.

## Docs

- [Architecture](docs/architecture.md)
- [Runtime setup](docs/runtime-setup.md)
- [Conversation schema](docs/conversation-schema.md)
