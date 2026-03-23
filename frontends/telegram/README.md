# Telegram Adapter

This folder holds the Telegram-specific UI that drives operator alerts and approvals through the Vercel Chat SDK.

`frontends/telegram/src/telegram-ui.ts` wires into `@clog/types` and the shipped `@vercel/chat` adapter so it can bootstrap the runtime, send messages, and deliver recommendations.

Implementation notes:

- `createTelegramUi` expects callbacks that hit the central runtime surface (`/api/bootstrap`, `/api/chat`) to keep the Telegram experience in sync.
- Outbound notifications use the Vercel Chat handler placeholder (`packages/vercel-chat/index.js`) for now; swap this for the real Vercel Chat SDK once the integration keys exist.
- Future tabs (GUI, CLI) should treat Telegram as just another channel on the same surface so we can expand the `frontends/` folder later.
