# Architecture

## Goal

Build a specialized oversight agent that watches PostHog, reasons about what it sees, keeps the operator in the loop through chat, and can eventually prepare remediation PRs or deploys under explicit approval rules.

## Core Design

This scaffold is intentionally runtime-first:

- `apps/clog`
  - the authority for monitoring, findings, planning, approvals, and execution
- `apps/types`
  - the only contract frontends should depend on
- `frontends/*`
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
- chat adapters for outbound operator messaging

### `monitoring`

The monitoring loop lives here.

- `monitor-loop.ts`
  - gathers observations and turns them into findings

### `storage`

Currently in-memory only. This should eventually own:

- findings history
- thread/message persistence
- approval tokens
- execution audit logs
- scheduled jobs
- integration checkpoints

### `gateway`

The transport-agnostic typed surface. This is the layer web, Telegram, and CLI should all target.

### `server`

Bootstrapping plus the HTTP transport. This is where the system becomes a server, but the server remains a thin shell around the gateway.

### `ai bridge`

`apps/clog/src/brain/service.ts` is the shared chat entrypoint. It loads repo-level prompts from `apps/clog/src/brain/prompts`, then serves the same reply path to the gateway and Telegram frontend.

### `telegram front-end`

`apps/frontends/telegram/src/index.ts` is the first dedicated frontend workspace. It hosts the Telegram bot adapter and forwards operator messages into `@clog/core`, keeping Telegram-specific logic out of the core runtime package.

### `shell tooling`

`apps/clog/src/execution/shell-executor.ts` is the safe command runner. It only allows a small command set (`ls`, `cat`, `rg`, etc.), enforces that the requested working directory lives inside the permitted roots (`process.cwd()`, the `.runtime` contract, and `.runtime/workspace`), and streams the captured stdout/stderr back through `/api/shell`. Every frontend should go through that endpoint instead of spawning arbitrary shells.

## `.runtime` contract

`.runtime` now stores the runtime contract and guarded state slices:

- `settings.private.json` – runtime-level knobs and guard rails that the agent or model never reads.
- `model-settings.json` – the light settings snapshot the model can inspect so it knows its mode and available channels.
- `storage/` – per-instance runtime state such as SQLite persistence.
- `workspace/` – per-instance workspaces kept outside the tracked runtime contract.

These files are intentionally separated so sensitive runtime options stay offline, while shared prompt and knowledge files stay in the repo-level `apps/clog/src/brain` tree instead of per-instance runtime state.

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
