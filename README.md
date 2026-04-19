<p align="center">
  <img src="public/logo.png" alt="clog logo" width="180">
</p>

# clog

[![GitHub](https://img.shields.io/badge/GitHub-4everlabs%2Fclog-181717?logo=github)](https://github.com/4everlabs/clog)
[![Bun](https://img.shields.io/badge/Bun-1.3.11-000000?logo=bun)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Oxlint](https://img.shields.io/badge/Lint-Oxlint-111111)](https://oxc.rs/docs/guide/usage/linter.html)

`clog` is a runtime-first oversight agent for watching product and runtime health, pulling evidence from systems like PostHog, Convex, GitHub, and Vercel, and surfacing clear findings through a shared backend.

## What is here

- `apps/clog`: core runtime, gateway, monitoring loop, integrations, and AI bridge.
- `apps/types`: shared contracts consumed by every frontend.
- `apps/launcher`: bootstrap launcher and frontend chooser.
- `apps/frontends/tui`: terminal UI for the runtime.
- `apps/frontends/telegram`: Telegram transport and bridge.
- `apps/frontends/web`: Svelte dashboard frontend.
- `docs`: architecture, runtime setup, and service docs.

## Quick start

```bash
bun install
bun run dev
```

The launcher boots or connects to the runtime, then lets you choose `TUI` or `Web`.

Direct entrypoints:

```bash
bun run runtime
bun run tui
bun run web
```

## Common commands

```bash
bun run dev              # start the launcher
bun run runtime          # start the runtime only
bun run runtime --wakeup # start runtime and run one wakeup pass immediately
bun run tui              # start the terminal UI directly
bun run web              # start the Svelte dashboard in Vite
bun run web:build        # build the Svelte dashboard for the runtime server
bun run lint             # run oxlint
bun run typecheck        # run tsc --noEmit
bun run web:typecheck    # run svelte-check for the dashboard
bun run test             # run the Bun test suite
bun run build            # bundle apps/clog to dist/
bun run ci               # lint + typecheck + test
bun run update-all       # update workspace deps to latest
```

## How it is structured

`apps/clog` is the authority. Frontends are adapters.

- `src/runtime/config.ts`: environment parsing and capability shaping.
- `src/ai/brain/service.ts`: shared chat entrypoint used by the gateway and transports.
- `src/runtime`: runtime bootstrap/server/config plus monitoring, wakeup scheduling, and runtime read/orchestration services.
- `src/runtime/gateway`: transport-agnostic API surface.
- `src/integrations`: PostHog, Convex, GitHub, Vercel, and other external boundaries.
- `src/tools/shell-executor.ts`: restricted read-only shell access for runtime inspection.

## Runtime layout

The runtime expects per-instance state under `.runtime/instances/<instance>/`:

- `read-only/settings.json`: runtime-owned settings.
- `read-only/tools.json`: tool visibility and enablement.
- `read-only/wakeup.json`: wakeup enabled flag, prompt titles/prompts, and UTC daily schedule.
- `storage/`: structured runtime state.
- `workspace/`: model-targeted writable workspace.

This is a serverful setup and needs to run on a VM or container with a filesystem at minimum. For a serverless version, see [`vercel-claw`](https://github.com/henryoman/vercel-claw).

Secrets still belong in `.env`.

## Docs

- [Architecture](docs/architecture.md)
- [Runtime setup](docs/runtime-setup.md)
- [Conversation schema](docs/conversation-schema.md)
