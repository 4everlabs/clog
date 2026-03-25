import { JsonlConversationStore } from "../../../runtime/storage/conversations";

export interface TelegramConfig {
  botToken: string;
  allowedChatIds?: number[];
}

interface Command {
  name: string;
  description: string;
  handler: (chatId: number, args: string[]) => Promise<string>;
}

export class TelegramChatAdapter {
  private botToken: string;
  private allowedChatIds: Set<number>;
  private offset = 0;
  private conversationStore: JsonlConversationStore;
  private commands: Map<string, Command> = new Map();

  constructor(config: TelegramConfig, conversationStore: JsonlConversationStore) {
    this.botToken = config.botToken;
    this.allowedChatIds = new Set(config.allowedChatIds ?? []);
    this.conversationStore = conversationStore;
    this.registerDefaultCommands();
  }

  private registerDefaultCommands(): void {
    this.commands.set("help", {
      name: "help",
      description: "Show available commands",
      handler: async () => {
        const cmds = Array.from(this.commands.values());
        return "Available commands:\n" + cmds.map(c => `/${c.name} - ${c.description}`).join("\n");
      },
    });

    this.commands.set("newthread", {
      name: "newthread",
      description: "Start a new conversation thread",
      handler: async (chatId) => {
        this.conversationStore.clearThread("telegram", String(chatId));
        return "✓ Started a new thread. What would you like to ask?";
      },
    });

    this.commands.set("status", {
      name: "status",
      description: "Show agent status",
      handler: async () => {
        return "Agent is running. I'm watching your PostHog and Vercel.";
      },
    });

    this.commands.set("settings", {
      name: "settings",
      description: "Show or change settings",
      handler: async (_chatId, args) => {
        if (args.length === 0) {
          return `Current settings:
- mode: propose
- heartbeat: every 60s
- model: stepfun/flash-3.5

Change with: /settings <key> <value>`;
        }
        return "Settings update not implemented yet.";
      },
    });

    this.commands.set("wakeup", {
      name: "wakeup",
      description: "Show wakeup prompt or configure heartbeat",
      handler: async (_chatId, args) => {
        if (args[0] === "interval") {
          const interval = args[1];
          if (interval) {
            return `✓ Wakeup interval set to ${interval}. (Not persisted yet)`;
          }
          return "Current interval: 60s. Use /wakeup interval <seconds>";
        }
        return `Wakeup prompt controls what the agent does when it wakes up.
        
Current: checks PostHog errors, Vercel deployments, insights

Use /wakeup interval <seconds> to change how often it wakes up.`;
      },
    });

    this.commands.set("prompt", {
      name: "prompt",
      description: "Show or update system prompts",
      handler: async (_chatId, args) => {
        if (args[0] === "system") {
          return `SYSTEM.md:
You are Clog, a PostHog-driven oversight agent.`;
        }
        if (args[0] === "primary") {
          return `primary mode:
Operating mode: propose - suggest actions but don't execute`;
        }
        return `Available prompts: system, primary, wakeup

Use /prompt <name> to view. Updates not yet implemented.`;
      },
    });
  }

  async start(onMessage: (channel: string, threadId: string, message: string) => Promise<string>): Promise<void> {
    console.log("[telegram] Starting polling...");
    
    while (true) {
      try {
        const updates = await this.getUpdates();
        for (const update of updates) {
          this.offset = update.update_id + 1;
          
          const chatId = update.message?.chat.id ?? update.edited_message?.chat.id;
          const text = update.message?.text ?? update.edited_message?.text;
          
          if (!chatId || !text || !update.message) continue;
          
          if (this.allowedChatIds.size > 0 && !this.allowedChatIds.has(chatId)) {
            await this.sendMessage(chatId, "Unauthorized. Ask the operator to add your chat ID.");
            continue;
          }

          const threadId = String(chatId);

          // Check for commands
          if (text.startsWith("/")) {
            const parts = text.slice(1).split(" ");
            const cmdName = (parts[0] ?? "").toLowerCase();
            const args = parts.slice(1);

            const cmd = this.commands.get(cmdName);
            if (cmd) {
              const response = await cmd.handler(chatId, args);
              await this.sendMessage(chatId, response);
              continue;
            } else {
              await this.sendMessage(chatId, `Unknown command: /${cmdName}. Use /help for available commands.`);
              continue;
            }
          }

          // Regular message - save and get AI response
          this.conversationStore.appendMessage("telegram", threadId, {
            role: "user",
            content: text,
          });

          const response = await onMessage("telegram", threadId, text);
          
          this.conversationStore.appendMessage("telegram", threadId, {
            role: "assistant",
            content: response,
          });
          
          await this.sendMessage(chatId, response);
        }
      } catch (error) {
        console.error("[telegram] Polling error:", error);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  private async getUpdates(): Promise<Array<{ update_id: number; message?: { chat: { id: number }; text?: string }; edited_message?: { chat: { id: number }; text?: string } }>> {
    const url = `https://api.telegram.org/bot${this.botToken}/getUpdates`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeout: 30, offset: this.offset }),
    });
    const data = await response.json() as { ok: boolean; result: Array<{ update_id: number; message?: { chat: { id: number }; text?: string }; edited_message?: { chat: { id: number }; text?: string } }> };
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

export const createTelegramChatAdapter = (config: TelegramConfig, conversationStore: JsonlConversationStore): TelegramChatAdapter => {
  return new TelegramChatAdapter(config, conversationStore);
};
