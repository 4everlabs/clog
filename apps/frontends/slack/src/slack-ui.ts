import { createSlackAdapter } from "@chat-adapter/slack";
import { createMemoryState } from "@chat-adapter/state-memory";
import { Chat } from "chat";
import type { SurfaceBootstrapResponse, SurfaceSendMessageRequest } from "@clog/types";

export interface SlackUiOptions {
  readonly onBootstrap: () => Promise<SurfaceBootstrapResponse>;
  readonly onSendMessage: (input: SurfaceSendMessageRequest) => Promise<void>;
  readonly botUserName?: string;
}

export const createSlackUi = (options: SlackUiOptions) => {
  const bot = new Chat({
    userName: options.botUserName ?? "clog",
    adapters: {
      slack: createSlackAdapter(),
    },
    state: createMemoryState(),
  });

  return {
    bot,
    async start() {
      const runtime = await options.onBootstrap();
      console.log("Slack UI ready to notify operator about", runtime.openFindings, "findings.");
      return bot;
    },

    async notify(message: string) {
      await options.onSendMessage({ channel: "slack", message });
    },
  };
};
