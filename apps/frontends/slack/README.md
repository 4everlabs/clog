# Slack Adapter

This folder holds the Slack-specific UI that drives operator alerts and approvals through Vercel's Chat SDK.

`apps/frontends/slack/src/slack-ui.ts` wires into `@clog/types` and the official `chat` and `@chat-adapter/slack` packages so it can bootstrap the runtime, send messages, and deliver recommendations.

Implementation notes:

- `createSlackUi` expects callbacks that hit the central runtime surface (`/api/bootstrap`, `/api/chat`) to keep the Slack experience in sync.
- The adapter initializes the official Chat SDK Slack adapter so the frontend is ready for a real Slack app configuration instead of the old local stub.
- Future tabs (GUI, CLI) should treat Slack as just another channel on the same surface so we can expand the `frontends/` folder later.
