# clog

Backend-first scaffold for the `clog` oversight agent (short for “claw post hog”).

## Workspace layout

- `apps/clog`: runtime, monitoring loop, gateway, and AI bridge.
- `apps/types`: shared contract for every frontend channel.
- `frontends/telegram`: first adapter using the Vercel Chat SDK stub.
- `packages/vercel-*`: workspace placeholders for `@vercel/ai` v6 and `@vercel/chat` while offline.
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
2. `apps/clog/src/runtime/ai/vercel.ts` creates a Vercel AI `Chat` helper (currently wired to the workspace stub). `bootstrap.ts` exposes it via `runtime.aiRuntime`.
3. Monitoring, findings, and proposed actions stay in `apps/clog/src/storage` and `gateway`.
4. Frontends such as `frontends/telegram` talk to `/api/*` on `apps/clog` so Telegram, GUI, and CLI can share the same surface.

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
