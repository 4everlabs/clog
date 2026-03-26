# clog

Backend-first scaffold for the `clog` oversight agent (short for “claw post hog”).

## Workspace layout

- `apps/clog`: runtime, monitoring loop, gateway, and AI bridge.
- `apps/types`: shared contract for every frontend channel.
- `apps/frontends/cli`: CLI frontend package.
- `apps/frontends/web`: placeholder package for the eventual web UI.
- `apps/frontends/telegram`: Telegram frontend package and runtime bridge.
- `.runtime/`: runtime-centered settings, storage, and workspace structure (see below).

## Commands

```bash
bun install
bun run runtime
bun run cli
bun run lint
bun run typecheck
bun run test
bun run build
bun run ci         # lint + typecheck + test
bun run update-all # update root + workspace deps to latest
```

`bun run lint` executes `oxlint` across the repo, `bun run typecheck` runs `tsc`, `bun run test` runs the Bun test suite, and `bun run build` bundles `apps/clog` via `bun build`. `bun run ci` stops on the first failure. `bun run update-all` bumps root and workspace dependencies to their latest versions.

## Runtime bootstrapping

1. The environment loader in `apps/clog/src/config.ts` shapes capability flags, monitor intervals, and channel broadcasts.
2. `apps/clog/src/brain/service.ts` is the shared chat brain used by the gateway and Telegram transport. It loads app-owned prompts from `apps/clog/src/brain`, plus the per-instance wakeup config from `.runtime/instances/<instance>/wakeup.json`.
3. Monitoring, findings, and proposed actions stay in `apps/clog/src/monitoring`, `apps/clog/src/storage`, and `apps/clog/src/gateway`.
4. The Telegram transport in `apps/frontends/telegram/src/telegram.ts` and the web/CLI connectors all talk to the same runtime surface on `apps/clog` so Telegram, GUI, and CLI can share the same domain model.

## Shell tooling

`apps/clog/src/execution/shell-executor.ts` exposes a restricted `/api/shell` endpoint. The executor enforces a read-only allow list (`ls`, `cat`, `rg`, `grep`, `head`, `tail`, `wc`, `find`), keeps execution inside runtime-approved roots, and captures stdout/stderr/duration so the model can inspect data without escaping the sandbox.

## `.runtime` structure

The `.runtime` folder is the protected contract area that the runtime expects. Each instance contains:

- `read-only/settings.json` – runtime-facing settings kept out of model access.
- `read-only/tools.json` – tool visibility and enablement for the model/runtime surface.
- `wakeup.json` – per-instance wakeup message and frequency in one editable file.
- `storage/` – per-instance structured JSON state and runtime-owned persistence.
- `workspace/` – the model-targeted writable workspace area.

Secrets and real API keys still live in `.env` for now, not in the tracked instance settings files.

Create files inside these folders before connecting live services.

## Next steps

1. Wire real PostHog, GitHub, and Vercel clients to replace the stubs.
2. Persist findings/threads and add approval history.
3. Expand frontends (GUI, CLI) against `@clog/types`.
