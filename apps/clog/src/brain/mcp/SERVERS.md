# MCP Notes

The runtime does not rely on editor-managed MCP launcher configs in this repo.

For PostHog, `clog` talks to the remote PostHog MCP endpoint directly from Bun using the runtime code in `src/integrations/posthog/mcp-client.ts`.

## Why

- Avoid Node-based helper wrappers for PostHog MCP.
- Keep MCP usage inside the runtime's typed tool path.
- Make it obvious that the runtime, not the editor, owns PostHog MCP access.

## Rule

- Do not add `npx`-based PostHog MCP launch configs here.
- If PostHog MCP behavior changes, update the Bun client implementation instead.
