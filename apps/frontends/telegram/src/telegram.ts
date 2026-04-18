import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Chat, markdownToPlainText, type Message, type Thread } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createMemoryState } from "@chat-adapter/state-memory";
import type { RuntimeBootstrap } from "@clog/core";
import {
  convertMarkdownToTelegramMarkdownV2,
  telegramMarkdownV2ParseMode,
} from "./markdown-v2";

const writeStdoutLine = (value: string): void => {
  process.stdout.write(`${value}\n`);
};

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const TELEGRAM_CONVERSATION_TITLE = "Telegram Conversation";
const TELEGRAM_TARGET_STATE_FILE = "telegram-target.json";
const TELEGRAM_QUEUE_KEY = "telegram";

type TelegramThreadTarget = {
  chatId: string;
  messageThreadId?: number;
};

type TelegramSendMessageResponse = {
  ok: boolean;
  description?: string;
};

type SavedTelegramTarget = {
  readonly threadId: string;
  readonly updatedAt: number;
};

const getTelegramTargetStatePath = (runtime: Pick<RuntimeBootstrap, "env">): string =>
  join(runtime.env.storage.stateDir, TELEGRAM_TARGET_STATE_FILE);

const readSavedTelegramTarget = (runtime: Pick<RuntimeBootstrap, "env">): string | null => {
  try {
    const payload = JSON.parse(readFileSync(getTelegramTargetStatePath(runtime), "utf-8")) as Partial<SavedTelegramTarget>;
    return typeof payload.threadId === "string" && payload.threadId.startsWith("telegram:")
      ? payload.threadId
      : null;
  } catch {
    return null;
  }
};

const persistTelegramTarget = (
  runtime: Pick<RuntimeBootstrap, "env">,
  threadId: string,
): void => {
  if (!threadId.startsWith("telegram:")) {
    return;
  }

  const path = getTelegramTargetStatePath(runtime);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({
    threadId,
    updatedAt: Date.now(),
  }, null, 2));
};

const getRawChatId = (message: Message): number | null => {
  const raw = message.raw as { chat?: { id?: unknown } } | undefined;
  return typeof raw?.chat?.id === "number" ? raw.chat.id : null;
};

const getConfiguredTelegramChatId = (allowedChatIds: readonly number[]): number | null => {
  const chatId = allowedChatIds[0];
  return typeof chatId === "number" && Number.isFinite(chatId) ? chatId : null;
};

const isAllowedChat = (message: Message, configuredChatId: number | null): boolean => {
  if (configuredChatId === null) {
    return true;
  }

  const chatId = getRawChatId(message);
  return chatId === configuredChatId;
};

const normalizeTelegramReplyText = (value: string): string => {
  const normalized = value
    .replace(/\r\n/gu, "\n")
    .trim();

  return normalized.length > 0 ? normalized : "I do not have a useful reply yet.";
};

const decodeTelegramThreadId = (threadId: string): TelegramThreadTarget => {
  const parts = threadId.split(":");
  if (parts[0] !== "telegram" || parts.length < 2 || parts.length > 3) {
    throw new Error(`Invalid Telegram thread ID: ${threadId}`);
  }

  const chatId = parts[1];
  if (!chatId) {
    throw new Error(`Invalid Telegram thread ID: ${threadId}`);
  }

  const messageThreadIdRaw = parts[2];
  if (!messageThreadIdRaw) {
    return { chatId };
  }

  const messageThreadId = Number.parseInt(messageThreadIdRaw, 10);
  if (!Number.isInteger(messageThreadId)) {
    throw new Error(`Invalid Telegram message thread ID: ${threadId}`);
  }

  return {
    chatId,
    messageThreadId,
  };
};

const sendTelegramMessage = async (
  botToken: string,
  threadId: string,
  text: string,
  parseMode?: string,
): Promise<void> => {
  const target = decodeTelegramThreadId(threadId);
  const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: target.chatId,
      message_thread_id: target.messageThreadId,
      text,
      parse_mode: parseMode,
    }),
  });

  const payload = await response.json() as TelegramSendMessageResponse;
  if (!response.ok || !payload.ok) {
    const description = payload.description ?? response.statusText;
    throw new Error(`Telegram sendMessage failed: ${description}`);
  }
};

const sendTelegramReply = async (
  botToken: string,
  threadId: string,
  markdown: string,
): Promise<void> => {
  const telegramMarkdown = convertMarkdownToTelegramMarkdownV2(markdown);

  try {
    await sendTelegramMessage(botToken, threadId, telegramMarkdown, telegramMarkdownV2ParseMode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("parse entities")) {
      throw error;
    }

    const plainText = normalizeTelegramReplyText(markdownToPlainText(markdown));
    await sendTelegramMessage(botToken, threadId, plainText);
    writeStdoutLine("[telegram] MarkdownV2 parse failed, fell back to plain text");
  }
};

const getTelegramConversationThreadId = (runtime: Pick<RuntimeBootstrap, "store">): string | null => {
  return runtime.store.listThreads().find((entry) => (
    entry.channel === "telegram" && entry.title === TELEGRAM_CONVERSATION_TITLE
  ))?.id ?? null;
};

const forwardMessageToRuntime = async (
  runtime: RuntimeBootstrap,
  message: Message,
): Promise<string> => {
  const existingThreadId = getTelegramConversationThreadId(runtime);
  const response = await runtime.gateway.sendMessage(
    existingThreadId
      ? {
          channel: "telegram",
          threadId: existingThreadId,
          message: message.text,
        }
      : {
          channel: "telegram",
          title: TELEGRAM_CONVERSATION_TITLE,
          message: message.text,
        },
  );

  return response.replyMessage.content;
};

const postRuntimeReply = async (
  runtime: RuntimeBootstrap,
  botToken: string,
  configuredChatId: number | null,
  thread: Thread,
  message: Message,
): Promise<void> => {
  if (!isAllowedChat(message, configuredChatId)) {
    return;
  }

  persistTelegramTarget(runtime, thread.id);
  writeStdoutLine(`[telegram] received message on ${thread.id}: ${message.text}`);
  const reply = await forwardMessageToRuntime(runtime, message);
  const plainTextReply = normalizeTelegramReplyText(reply);
  await sendTelegramReply(botToken, thread.id, plainTextReply);
  writeStdoutLine(`[telegram] posted reply on ${thread.id}: ${plainTextReply.slice(0, 240)}`);
};

const queueThreadReply = (
  threadQueues: Map<string, Promise<void>>,
  threadId: string,
  operation: () => Promise<void>,
): Promise<void> => {
  const previous = threadQueues.get(threadId) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(operation);

  threadQueues.set(threadId, run);

  return run.finally(() => {
    if (threadQueues.get(threadId) === run) {
      threadQueues.delete(threadId);
    }
  });
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

  const threadQueues = new Map<string, Promise<void>>();
  const configuredChatId = getConfiguredTelegramChatId(runtime.env.telegram.allowedChatIds);
  if (runtime.env.telegram.allowedChatIds.length > 1) {
    writeStdoutLine(`[telegram] multiple allowed chats configured; using only ${String(configuredChatId)}`);
  }

  bot.onNewMention(async (thread, message) => {
    await queueThreadReply(threadQueues, TELEGRAM_QUEUE_KEY, async () => {
      await thread.subscribe();
      await postRuntimeReply(runtime, botToken, configuredChatId, thread, message);
    });
  });

  // Allow a first plain-text message to start a Telegram conversation without requiring an @-mention.
  bot.onNewMessage(/[\s\S]+/u, async (thread, message) => {
    await queueThreadReply(threadQueues, TELEGRAM_QUEUE_KEY, async () => {
      await thread.subscribe();
      await postRuntimeReply(runtime, botToken, configuredChatId, thread, message);
    });
  });

  bot.onSubscribedMessage(async (thread, message) => {
    await queueThreadReply(threadQueues, TELEGRAM_QUEUE_KEY, async () => {
      await postRuntimeReply(runtime, botToken, configuredChatId, thread, message);
    });
  });

  await bot.initialize();
  writeStdoutLine(`[telegram] Chat SDK initialized in ${telegram.runtimeMode} mode`);
};

const resolveTelegramNotificationTarget = (runtime: Pick<RuntimeBootstrap, "env">): string | null => {
  const savedTarget = readSavedTelegramTarget(runtime);
  if (savedTarget) {
    return savedTarget;
  }

  const configuredChatId = getConfiguredTelegramChatId(runtime.env.telegram.allowedChatIds);
  return configuredChatId === null ? null : `telegram:${configuredChatId}`;
};

export const sendTelegramOperatorNotifications = async (
  runtime: Pick<RuntimeBootstrap, "env">,
  markdown: string,
): Promise<number> => {
  const botToken = runtime.env.telegram.botToken;
  if (!botToken) {
    return 0;
  }

  const target = resolveTelegramNotificationTarget(runtime);
  if (!target) {
    writeStdoutLine("[telegram] skipped proactive notification because no Telegram targets are known yet");
    return 0;
  }

  const normalizedReply = normalizeTelegramReplyText(markdown);
  await sendTelegramReply(botToken, target, normalizedReply);
  writeStdoutLine(`[telegram] proactive notification posted on ${target}: ${normalizedReply.slice(0, 240)}`);
  return 1;
};
