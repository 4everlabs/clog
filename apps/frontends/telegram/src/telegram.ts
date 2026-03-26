/* eslint-disable no-console */

import { Chat, type Message, type Thread } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createMemoryState } from "@chat-adapter/state-memory";
import type { RuntimeBootstrap } from "@clog/core";

const getThreadTitle = (threadId: string): string => `Telegram Thread ${threadId}`;

const getRawChatId = (message: Message): number | null => {
  const raw = message.raw as { chat?: { id?: unknown } } | undefined;
  return typeof raw?.chat?.id === "number" ? raw.chat.id : null;
};

const isAllowedChat = (message: Message, allowedChatIds: readonly number[]): boolean => {
  if (allowedChatIds.length === 0) {
    return true;
  }

  const chatId = getRawChatId(message);
  return chatId !== null && allowedChatIds.includes(chatId);
};

const normalizeTelegramReplyText = (value: string): string => {
  const normalized = value
    .replace(/\r\n/gu, "\n")
    .trim();

  return normalized.length > 0 ? normalized : "I do not have a useful reply yet.";
};

const forwardMessageToRuntime = async (
  runtime: RuntimeBootstrap,
  runtimeThreadIds: Map<string, string>,
  thread: Thread,
  message: Message,
): Promise<string> => {
  const title = getThreadTitle(thread.id);
  const existingThreadId = runtimeThreadIds.get(thread.id)
    ?? runtime.store.listThreads().find((entry) => entry.channel === "telegram" && entry.title === title)?.id;

  const response = await runtime.gateway.sendMessage(
    existingThreadId
      ? {
          channel: "telegram",
          threadId: existingThreadId,
          message: message.text,
        }
      : {
          channel: "telegram",
          title,
          message: message.text,
        },
  );

  runtimeThreadIds.set(thread.id, response.thread.id);
  return response.replyMessage.content;
};

const postRuntimeReply = async (
  runtime: RuntimeBootstrap,
  runtimeThreadIds: Map<string, string>,
  allowedChatIds: readonly number[],
  thread: Thread,
  message: Message,
): Promise<void> => {
  if (!isAllowedChat(message, allowedChatIds)) {
    return;
  }

  console.log(`[telegram] received message on ${thread.id}: ${message.text}`);
  const reply = await forwardMessageToRuntime(runtime, runtimeThreadIds, thread, message);
  const plainTextReply = normalizeTelegramReplyText(reply);
  await thread.post(plainTextReply);
  console.log(`[telegram] posted reply on ${thread.id}: ${plainTextReply.slice(0, 240)}`);
};

export const startTelegramSurface = async (runtime: RuntimeBootstrap): Promise<void> => {
  const botToken = runtime.env.telegram.botToken;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required when Telegram is enabled.");
  }

  const telegram = createTelegramAdapter({
    mode: "polling",
    userName: runtime.env.telegram.userName ?? undefined,
  });

  const bot = new Chat({
    userName: runtime.env.telegram.userName ?? "clog",
    adapters: {
      telegram,
    },
    state: createMemoryState(),
  });

  const runtimeThreadIds = new Map<string, string>();
  const allowedChatIds = [...runtime.env.telegram.allowedChatIds];

  bot.onNewMention(async (thread, message) => {
    await thread.subscribe();
    await postRuntimeReply(runtime, runtimeThreadIds, allowedChatIds, thread, message);
  });

  // Allow a first plain-text message to start a Telegram conversation without requiring an @-mention.
  bot.onNewMessage(/[\s\S]+/u, async (thread, message) => {
    await thread.subscribe();
    await postRuntimeReply(runtime, runtimeThreadIds, allowedChatIds, thread, message);
  });

  bot.onSubscribedMessage(async (thread, message) => {
    await postRuntimeReply(runtime, runtimeThreadIds, allowedChatIds, thread, message);
  });

  await bot.initialize();
  console.log(`[telegram] Chat SDK initialized in ${telegram.runtimeMode} mode`);
};
