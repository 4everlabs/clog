import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface ConversationMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  tool_calls?: ToolCall[];
  metadata?: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export interface ThreadMeta {
  thread_id: string;
  channel: string;
  created_at: number;
  updated_at: number;
  title?: string;
  participants: string[];
}

const createId = (): string => {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

export class JsonlConversationStore {
  private baseDir: string;

  constructor(baseDir = ".conversations") {
    this.baseDir = baseDir;
  }

  private getPath(channel: string, threadId: string): string {
    const dir = join(this.baseDir, channel);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return join(dir, `${threadId}.jsonl`);
  }

  private getMetaPath(channel: string, threadId: string): string {
    return join(this.baseDir, channel, `${threadId}.meta.json`);
  }

  appendMessage(channel: string, threadId: string, msg: Omit<ConversationMessage, "id" | "timestamp">): ConversationMessage {
    const fullMsg: ConversationMessage = {
      ...msg,
      id: createId(),
      timestamp: Date.now(),
    };

    const path = this.getPath(channel, threadId);
    appendFileSync(path, JSON.stringify(fullMsg) + "\n");

    // Update meta
    this.updateMeta(channel, threadId, (meta) => {
      meta.updated_at = fullMsg.timestamp;
      if (msg.role === "user" && !meta.participants.includes("user")) {
        meta.participants.push("user");
      }
      if (msg.role === "assistant" && !meta.participants.includes("clog")) {
        meta.participants.push("clog");
      }
    });

    return fullMsg;
  }

  getMessages(channel: string, threadId: string): ConversationMessage[] {
    const path = this.getPath(channel, threadId);
    if (!existsSync(path)) {
      return [];
    }

    const content = readFileSync(path, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    
    const messages: ConversationMessage[] = [];
    for (const line of lines) {
      try {
        messages.push(JSON.parse(line) as ConversationMessage);
      } catch {
        // Skip malformed lines
      }
    }
    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }

  getMessagesForLLM(channel: string, threadId: string, limit = 20): Array<{ role: string; content: string }> {
    const messages = this.getMessages(channel, threadId);
    return messages.slice(-limit).map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  clearThread(channel: string, threadId: string): void {
    const path = this.getPath(channel, threadId);
    const metaPath = this.getMetaPath(channel, threadId);
    
    if (existsSync(path)) {
      writeFileSync(path, "");
    }
    if (existsSync(metaPath)) {
      writeFileSync(metaPath, JSON.stringify(this.createMeta(channel, threadId), null, 2));
    }
  }

  private createMeta(channel: string, threadId: string): ThreadMeta {
    return {
      thread_id: threadId,
      channel,
      created_at: Date.now(),
      updated_at: Date.now(),
      participants: [],
    };
  }

  private updateMeta(channel: string, threadId: string, update: (meta: ThreadMeta) => void): void {
    const path = this.getMetaPath(channel, threadId);
    let meta: ThreadMeta;

    if (existsSync(path)) {
      meta = JSON.parse(readFileSync(path, "utf-8"));
    } else {
      meta = this.createMeta(channel, threadId);
    }

    update(meta);
    writeFileSync(path, JSON.stringify(meta, null, 2));
  }

  getMeta(channel: string, threadId: string): ThreadMeta | null {
    const path = this.getMetaPath(channel, threadId);
    if (!existsSync(path)) {
      return null;
    }
    return JSON.parse(readFileSync(path, "utf-8"));
  }

  setTitle(channel: string, threadId: string, title: string): void {
    this.updateMeta(channel, threadId, (meta) => {
      meta.title = title;
    });
  }

  listThreads(channel?: string): ThreadMeta[] {
    const dir = channel ? join(this.baseDir, channel) : this.baseDir;
    if (!existsSync(dir)) {
      return [];
    }

    const { readdirSync } = require("fs");
    const files = readdirSync(dir);
    
    return files
      .filter((f: string) => f.endsWith(".meta.json"))
      .map((f: string) => {
        const metaPath = join(dir, f);
        return JSON.parse(readFileSync(metaPath, "utf-8")) as ThreadMeta;
      })
      .sort((a: ThreadMeta, b: ThreadMeta) => b.updated_at - a.updated_at);
  }
}

export const createConversationStore = (baseDir?: string): JsonlConversationStore => {
  return new JsonlConversationStore(baseDir);
};
