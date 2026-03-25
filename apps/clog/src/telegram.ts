import type { RuntimeBootstrap } from "./bootstrap";
import { TelegramFrontend } from "../../frontends/telegram/src/adapter";

const getThreadTitle = (chatId: number): string => `Telegram Chat ${chatId}`;

export const startTelegramSurface = async (runtime: RuntimeBootstrap): Promise<void> => {
  const botToken = runtime.env.telegram.botToken;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required when Telegram is enabled.");
  }

  const frontend = new TelegramFrontend({
    botToken,
    allowedChatIds: [...runtime.env.telegram.allowedChatIds],
  });
  const runtimeThreadIds = new Map<number, string>();

  await frontend.start(
    async (chatId, message) => {
      const title = getThreadTitle(chatId);
      const existingThreadId = runtimeThreadIds.get(chatId)
        ?? runtime.store.listThreads().find((thread) => thread.channel === "telegram" && thread.title === title)?.id;
      const response = await runtime.gateway.sendMessage(
        existingThreadId
          ? {
              channel: "telegram",
              threadId: existingThreadId,
              message,
            }
          : {
              channel: "telegram",
              title,
              message,
            },
      );

      runtimeThreadIds.set(chatId, response.thread.id);
      return response.replyMessage.content;
    },
    (chatId) => {
      runtimeThreadIds.delete(chatId);
    },
  );
};
