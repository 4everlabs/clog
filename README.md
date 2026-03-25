# clog

Backend-first scaffold for the `clog` oversight agent (short for “claw post hog”).

## Workspace layout

- `apps/clog`: runtime, monitoring loop, gateway, and AI bridge.
- `apps/types`: shared contract for every frontend channel.
- `apps/frontends/telegram`: Telegram bot frontend that forwards operator messages into the runtime.
- `apps/frontends/web`: placeholder package for the eventual web UI.
- `.runtime/`: runtime-centered settings, brain, and workspace structure (see below).

## Commands

```bash
bun install
bun run lint
bun run typecheck
bun run build
bun run ci   # lint + typecheck + build
```

`bun run lint` executes `oxlint`, `bun run typecheck` runs `tsc`, and `bun run build` bundles `apps/clog` via `bun build`. `bun run ci` chains all of them to keep the runtime clean.

## Runtime bootstrapping

1. The environment loader in `apps/clog/src/config/env.ts` shapes capability flags, monitor intervals, and channel broadcasts.
2. `apps/clog/src/runtime/ai/assistant.ts` is the single chat brain used by the gateway, CLI, and Telegram frontend. It loads repo prompts plus instance-scoped prompt files from `.runtime`.
3. Monitoring, findings, and proposed actions stay in `apps/clog/src/runtime` and `gateway`.
4. Frontends such as `apps/frontends/telegram` talk to the runtime surface on `apps/clog` so Telegram, GUI, and CLI can share the same domain model.

## Shell tooling

`apps/clog/src/runtime/tools/shell-executor.ts` exposes a restricted `/api/shell` endpoint. The executor enforces an allow list (`ls`, `cat`, `rg`, `grep`, `head`, `tail`, `wc`, `find`), always runs inside safe roots (`process.cwd()`, `.runtime`, `.runtime/workspace`), and captures stdout/stderr/duration so the model can grep or inspect data without escaping the sandbox.

## `.runtime` structure

The `.runtime` folder is the protected contract area that the runtime expects. It contains:

- `settings.private.json` – runtime-owned configuration that the agent or model should never see (monitor cadence, channel filters, etc.).
- `model-settings.json` – lightweight, operator-curated metadata that can be safely embedded in prompts (mode, preferred channels, talk-back instructions).
- `brain/knowledge` – reserved for knowledge graphs, prompts, or embeddings.
- `workspace/` – per-instance workspace area that frontends or the runtime might mount.

Create files inside these folders before connecting live services.

## Next steps

1. Wire real PostHog, GitHub, and Vercel clients to replace the stubs.
2. Persist findings/threads and add approval history.
3. Expand frontends (GUI, CLI) against `@clog/types`.
