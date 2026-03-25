import type { SurfaceSendMessageRequest, SurfaceChannelKind } from "@clog/types";

interface TelegramConfig {
  botToken: string;
  allowedChatIds?: number[];
}

export class TelegramAdapter {
  private botToken: string;
  private allowedChatIds: Set<number>;
  private offset = 0;

  constructor(config: TelegramConfig) {
    this.botToken = config.botToken;
    this.allowedChatIds = new Set(config.allowedChatIds ?? []);
  }

  async describeHealth(): Promise<{ kind: string; status: string; summary: string }> {
    try {
      const me = await this.api("getMe") as { ok: boolean; result: { username?: string } };
      return {
        kind: "telegram",
        status: "ready",
        summary: `Connected as @${me.result.username ?? "unknown"}`,
      };
    } catch (error) {
      return {
        kind: "telegram",
        status: "error",
        summary: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async startPolling(onMessage: (chatId: number, text: string) => Promise<void>): Promise<void> {
    console.log("[telegram] Starting polling...");
    
    while (true) {
      try {
        const updates = await this.api("getUpdates", {
          timeout: 30,
          offset: this.offset,
        }) as { ok: boolean; result: Array<{ update_id: number; message?: { chat: { id: number }; text?: string }; edited_message?: { chat: { id: number }; text?: string } }> };

        for (const update of updates.result ?? []) {
          this.offset = update.update_id + 1;
          
          const chatId = update.message?.chat.id ?? update.edited_message?.chat.id;
          const text = update.message?.text ?? update.edited_message?.text;
          
          if (!chatId || !text) continue;
          if (this.allowedChatIds.size > 0 && !this.allowedChatIds.has(chatId)) {
            await this.sendMessage(chatId, "Unauthorized. Talk to the operator to get access.");
            continue;
          }
          
          await onMessage(chatId, text);
        }
      } catch (error) {
        console.error("[telegram] Polling error:", error);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    await this.api("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    });
  }

  private async api(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const url = `https://api.telegram.org/bot${this.botToken}/${method}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: params ? JSON.stringify(params) : undefined,
    });
    const data = await response.json();
    if (!(data as { ok: boolean }).ok) {
      throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
    }
    return data;
  }
}

export const createTelegramAdapter = (botToken: string, allowedChatIds?: number[]): TelegramAdapter => {
  return new TelegramAdapter({ botToken, allowedChatIds });
};
