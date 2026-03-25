import { TelegramFrontend } from "./adapter";
import { ClogApiClient, resolveBackendBaseUrl } from "./clog-api";

const parseAllowedChatIds = (value: string | undefined): number[] => {
  return (value ?? "")
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isFinite(entry));
};

const getThreadTitle = (chatId: number): string => `Telegram Chat ${chatId}`;

export const startTelegramFrontend = async (): Promise<void> => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required to start the Telegram frontend.");
  }

  const api = new ClogApiClient({ baseUrl: resolveBackendBaseUrl() });
  const frontend = new TelegramFrontend(
    {
      botToken,
      allowedChatIds: parseAllowedChatIds(process.env.TELEGRAM_ALLOWED_CHATS),
    },
  );

  const runtimeThreadIds = new Map<number, string>();

  await frontend.start(
    async (chatId, message) => {
      const title = getThreadTitle(chatId);
      const existingThreadId = runtimeThreadIds.get(chatId)
        ?? (await api.findThreadByTitle("telegram", title))?.id;

      const response = await api.sendMessage(
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
      return response.assistantMessage.content;
    },
    (chatId) => {
      runtimeThreadIds.delete(chatId);
    },
  );
};

if (import.meta.main) {
  await startTelegramFrontend();
}
