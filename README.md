# clog

Backend-first scaffold for the `clog` oversight agent (short for “claw post hog”).

## Workspace layout

- `apps/clog`: runtime, monitoring loop, gateway, and AI bridge.
- `apps/types`: shared contract for every frontend channel.
- `apps/frontends/telegram`: Telegram bot frontend that forwards operator messages into the runtime.
- `apps/frontends/web`: placeholder package for the eventual web UI.
- `.runtime/`: runtime-centered settings, storage, and workspace structure (see below).

## Commands

```bash
bun install
bun run runtime
bun run cli
bun run lint
bun run typecheck
bun run build
bun run ci   # lint + typecheck + build
```

`bun run lint` executes `oxlint`, `bun run typecheck` runs `tsc`, and `bun run build` bundles `apps/clog` via `bun build`. `bun run ci` chains all of them to keep the runtime clean.

## Runtime bootstrapping

1. The environment loader in `apps/clog/src/config.ts` shapes capability flags, monitor intervals, and channel broadcasts.
2. `apps/clog/src/brain/service.ts` is the shared chat brain used by the gateway and Telegram frontend. It loads app-owned prompts from `apps/clog/src/brain`, plus the per-instance wakeup config from `.runtime/instances/<instance>/wakeup.json`.
3. Monitoring, findings, and proposed actions stay in `apps/clog/src/monitoring`, `apps/clog/src/storage`, and `apps/clog/src/gateway`.
4. Frontends such as `apps/frontends/telegram` talk to the runtime surface on `apps/clog` so Telegram, GUI, and CLI can share the same domain model.

## Shell tooling

`apps/clog/src/execution/shell-executor.ts` exposes a restricted `/api/shell` endpoint. The executor enforces an allow list (`ls`, `cat`, `rg`, `grep`, `head`, `tail`, `wc`, `find`), always runs inside safe roots (`process.cwd()`, `.runtime`, `.runtime/workspace`), and captures stdout/stderr/duration so the model can inspect data without escaping the sandbox.

## `.runtime` structure

The `.runtime` folder is the protected contract area that the runtime expects. Each instance contains:

- `read-only/settings.json` – runtime-facing settings kept out of model access.
- `read-only/tools.json` – tool visibility and enablement for the model/runtime surface.
- `wakeup.json` – per-instance wakeup message and frequency in one editable file.
- `storage/` – per-instance SQLite state and runtime-owned persistence.
- `workspace/` – per-instance workspace area that frontends or the runtime might mount.

Secrets and real API keys still live in `.env` for now, not in the tracked instance settings files.

Create files inside these folders before connecting live services.

## Next steps

1. Wire real PostHog, GitHub, and Vercel clients to replace the stubs.
2. Persist findings/threads and add approval history.
3. Expand frontends (GUI, CLI) against `@clog/types`.
