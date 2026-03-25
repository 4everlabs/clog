export interface TelegramFrontendConfig {
  botToken: string;
  allowedChatIds?: number[];
}

interface Command {
  name: string;
  description: string;
  handler: (chatId: number, args: string[]) => Promise<string>;
}

export class TelegramFrontend {
  private readonly botToken: string;
  private readonly allowedChatIds: Set<number>;
  private readonly commands = new Map<string, Command>();
  private offset = 0;

  constructor(config: TelegramFrontendConfig) {
    this.botToken = config.botToken;
    this.allowedChatIds = new Set(config.allowedChatIds ?? []);
    this.registerDefaultCommands();
  }

  private registerDefaultCommands(): void {
    this.commands.set("help", {
      name: "help",
      description: "Show available commands",
      handler: async () => {
        const commands = Array.from(this.commands.values());
        return `Available commands:\n${commands.map((command) => `/${command.name} - ${command.description}`).join("\n")}`;
      },
    });

    this.commands.set("newthread", {
      name: "newthread",
      description: "Start a new conversation thread",
      handler: async () => {
        return "Started a new Telegram thread. Send the next message when you want a fresh conversation.";
      },
    });

    this.commands.set("status", {
      name: "status",
      description: "Show agent status",
      handler: async () => {
        return "Telegram frontend is online and forwarding messages to clog.";
      },
    });

    this.commands.set("wakeup", {
      name: "wakeup",
      description: "Show wakeup guidance",
      handler: async () => {
        return "Wakeup prompt is loaded from the runtime instance and controls what the agent checks each cycle.";
      },
    });

    this.commands.set("prompt", {
      name: "prompt",
      description: "Show prompt guidance",
      handler: async () => {
        return "Prompt files live under the runtime instance prompts folder. Use system.md for public base instructions and project.md for private instance context.";
      },
    });
  }

  async start(
    onMessage: (chatId: number, message: string) => Promise<string>,
    onResetThread?: (chatId: number) => void,
  ): Promise<void> {
    console.log("[telegram] Frontend polling started.");

    while (true) {
      try {
        const updates = await this.getUpdates();
        for (const update of updates) {
          this.offset = update.update_id + 1;

          const chatId = update.message?.chat.id ?? update.edited_message?.chat.id;
          const text = update.message?.text ?? update.edited_message?.text;
          if (!chatId || !text || !update.message) {
            continue;
          }

          if (this.allowedChatIds.size > 0 && !this.allowedChatIds.has(chatId)) {
            await this.sendMessage(chatId, "Unauthorized. Ask the operator to add your chat ID.");
            continue;
          }

          if (text.startsWith("/")) {
            const parts = text.slice(1).split(" ");
            const commandName = (parts[0] ?? "").toLowerCase();
            const args = parts.slice(1);
            const command = this.commands.get(commandName);

            if (!command) {
              await this.sendMessage(chatId, `Unknown command: /${commandName}. Use /help for available commands.`);
              continue;
            }

            if (commandName === "newthread") {
              onResetThread?.(chatId);
            }

            const response = await command.handler(chatId, args);
            await this.sendMessage(chatId, response);
            continue;
          }

          const response = await onMessage(chatId, text);

          await this.sendMessage(chatId, response);
        }
      } catch (error) {
        console.error("[telegram] Polling error:", error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async getUpdates(): Promise<Array<{
    update_id: number;
    message?: { chat: { id: number }; text?: string };
    edited_message?: { chat: { id: number }; text?: string };
  }>> {
    const url = `https://api.telegram.org/bot${this.botToken}/getUpdates`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeout: 30, offset: this.offset }),
    });
    const data = await response.json() as {
      ok: boolean;
      result: Array<{
        update_id: number;
        message?: { chat: { id: number }; text?: string };
        edited_message?: { chat: { id: number }; text?: string };
      }>;
    };
    return data.result ?? [];
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });
  }
}
