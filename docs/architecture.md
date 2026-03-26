# Architecture

## Goal

Build a specialized oversight agent that watches PostHog, reasons about what it sees, keeps the operator in the loop through chat, and can eventually prepare remediation PRs or deploys under explicit approval rules.

## Core Design

This scaffold is intentionally runtime-first:

- `apps/clog`
  - the authority for monitoring, findings, planning, approvals, and execution
- `apps/types`
  - the only contract frontends should depend on
- `apps/frontends/*`
  - adapters, not authorities

That keeps the web UI, Telegram bot, and CLI interchangeable. Each client talks to the same gateway and renders the same domain objects.

## Runtime Layers

### `config`

Environment parsing and capability shaping. This is where execution mode and integration permissions are declared.

### `integrations`

External-system boundaries:

- PostHog for metrics, insights, flags, exceptions, and anomaly detection
- GitHub for repo read access, branch creation, patching, and PR creation
- Vercel for deploy actions

Chat surfaces are not part of `integrations/`. They live under `apps/frontends/*` and attach to the gateway as transports or clients.

### `monitoring`

The monitoring loop lives here.

- `monitor-loop.ts`
  - gathers observations and turns them into findings

### `storage`

Runtime state lives in structured JSON files today. This layer owns:

- findings history
- thread/message persistence
- approval tokens
- execution audit logs
- scheduled jobs
- integration checkpoints

### `gateway`

The transport-agnostic typed surface. This is the layer web, Telegram, and CLI should all target.

### `server`

`apps/clog/src/bootstrap.ts` is the composition root that wires env, storage, integrations, tools, monitoring, and the gateway together.

`apps/clog/src/server.ts` is the HTTP and websocket transport. It stays thin and delegates requests into the gateway.

### `ai bridge`

`apps/clog/src/brain/service.ts` is the shared chat entrypoint. It loads app-owned prompts from `apps/clog/src/brain/prompts`, plus the per-instance wakeup config from `.runtime/instances/<instance>/wakeup.json`, then serves the same reply path to the gateway and Telegram transport bridge.

### `telegram transport`

`apps/frontends/telegram` is the Telegram frontend package.

`apps/frontends/telegram/src/telegram.ts` is the runtime-side Telegram bridge. It uses Chat SDK polling to receive Telegram messages and forwards them into the transport-agnostic gateway.

### `shell tooling`

`apps/clog/src/execution/shell-executor.ts` is the safe command runner. It only allows a small read-only command set (`ls`, `cat`, `rg`, etc.), enforces that the requested working directory lives inside the permitted runtime roots, and streams the captured stdout/stderr back through `/api/shell`. Every frontend should go through that endpoint instead of spawning arbitrary shells.

## `.runtime` contract

`.runtime` now stores only the per-instance runtime contract:

- `read-only/settings.json` – runtime-facing settings kept out of model access.
- `read-only/tools.json` – tool visibility and enablement for the model/runtime surface.
- `wakeup.json` – per-instance wakeup message and frequency in one editable file.
- `storage/` – per-instance runtime state such as `storage/state/*.json`.
- `workspace/` – per-instance workspaces kept outside the tracked runtime contract.

App-owned prompts, knowledge, skills, and MCP references stay in the repo-level `apps/clog/src/brain` tree. `.runtime` is for per-instance state and guidance, with `workspace/` as the only model-targeted writable area, `storage/` as runtime-owned persistence, and `read-only/` reserved for runtime-owned files the model should not browse directly.

## Execution Modes

- `observe`
  - watch and report only
- `propose`
  - watch, report, and stage actions that still require approval
- `execute`
  - reserved for tightly controlled future automation

## Safety Shape

The intended safety model is:

1. PostHog and GitHub can be read broadly.
2. Branch writes and PR creation should target an isolated automation branch strategy.
3. Deploys should remain approval-gated.
4. Frontends should never own side effects directly.
5. Every action should be explainable through findings and proposed actions in chat.

## Immediate Next Work

1. Add real PostHog project and insight queries.
2. Add GitHub repo context plus patch/PR pipeline.
3. Add persistent runtime state.
4. Add SSE or websocket event streaming for live frontends.
5. Build the first frontend against `@clog/types`.
