import chatAdapter from "@vercel/chat";
import type { SurfaceBootstrapResponse, SurfaceSendMessageRequest } from "@clog/types";

export interface TelegramUiOptions {
  readonly onBootstrap: () => Promise<SurfaceBootstrapResponse>;
  readonly onSendMessage: (input: SurfaceSendMessageRequest) => Promise<void>;
}

export const createTelegramUi = (options: TelegramUiOptions) => {
  const handler = chatAdapter.createHandler("clog-telegram");

  return {
    async start() {
      const runtime = await options.onBootstrap();
      console.log("Telegram UI ready to notify operator about", runtime.openFindings, "findings.");
    },

    async notify(message: string) {
      await options.onSendMessage({ channel: "telegram", message });
      await handler.send({ message });
    },
  };
};
