import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ActionExecutionResult,
  AgentFinding,
  AgentStatus,
  ConversationThread,
} from "@clog/types";
import type { RuntimeStorageConfig } from "../config";
import { InMemoryRuntimeStore } from "./in-memory-runtime-store";
import type { MemoryEntry, RuntimeStore } from "./chat";

interface PersistedRuntimeState {
  readonly status: AgentStatus;
  readonly findings: readonly AgentFinding[];
  readonly threads: readonly ConversationThread[];
  readonly memories: readonly MemoryEntry[];
  readonly actionResults: readonly ActionExecutionResult[];
}

const createEmptyState = (): PersistedRuntimeState => ({
  status: "booting",
  findings: [],
  threads: [],
  memories: [],
  actionResults: [],
});

export class SqliteRuntimeStore implements RuntimeStore {
  readonly config: RuntimeStorageConfig;
  private readonly memoryStore = new InMemoryRuntimeStore();

  constructor(config: RuntimeStorageConfig) {
    this.config = config;
    mkdirSync(dirname(config.databasePath), { recursive: true });
    this.restore();
  }

  close(): void {
    this.persist();
  }

  getStatus() {
    return this.memoryStore.getStatus();
  }

  setStatus(status: AgentStatus): void {
    this.memoryStore.setStatus(status);
    this.persist();
  }

  listFindings() {
    return this.memoryStore.listFindings();
  }

  upsertFindings(findings: readonly AgentFinding[]): void {
    this.memoryStore.upsertFindings(findings);
    this.persist();
  }

  acknowledgeFinding(findingId: string) {
    const result = this.memoryStore.acknowledgeFinding(findingId);
    this.persist();
    return result;
  }

  resolveFindingState(findingId: string, state: AgentFinding["state"]) {
    const result = this.memoryStore.resolveFindingState(findingId, state);
    this.persist();
    return result;
  }

  listThreads() {
    return this.memoryStore.listThreads();
  }

  getThread(threadId: string) {
    return this.memoryStore.getThread(threadId);
  }

  createThread(channel: ConversationThread["channel"], title: string) {
    const thread = this.memoryStore.createThread(channel, title);
    this.persist();
    return thread;
  }

  appendMessages(threadId: string, messages: readonly ConversationThread["messages"][number][]) {
    const thread = this.memoryStore.appendMessages(threadId, messages);
    this.persist();
    return thread;
  }

  createMessage(role: ConversationThread["messages"][number]["role"], channel: ConversationThread["channel"], content: string) {
    return this.memoryStore.createMessage(role, channel, content);
  }

  rememberActionResult(result: ActionExecutionResult): void {
    this.memoryStore.rememberActionResult(result);
    this.persist();
  }

  getActionResult(actionId: string) {
    return this.memoryStore.getActionResult(actionId);
  }

  seedOperatorThread(channel: ConversationThread["channel"], title?: string) {
    const thread = this.memoryStore.seedOperatorThread(channel, title);
    this.persist();
    return thread;
  }

  listActions() {
    return this.memoryStore.listActions();
  }

  listMemories() {
    return this.memoryStore.listMemories();
  }

  addMemory(memory: Omit<MemoryEntry, "id" | "createdAt">) {
    const entry = this.memoryStore.addMemory(memory);
    this.persist();
    return entry;
  }

  private persist(): void {
    const state: PersistedRuntimeState = {
      status: this.memoryStore.getStatus(),
      findings: this.memoryStore.listFindings(),
      threads: this.memoryStore.listThreads(),
      memories: this.memoryStore.listMemories(),
      actionResults: [],
    };
    writeFileSync(this.config.databasePath, JSON.stringify(state, null, 2), "utf-8");
  }

  private restore(): void {
    if (!existsSync(this.config.databasePath)) {
      this.persist();
      return;
    }

    const parsed = JSON.parse(readFileSync(this.config.databasePath, "utf-8")) as PersistedRuntimeState;
    const state = {
      ...createEmptyState(),
      ...parsed,
    };

    this.memoryStore.setStatus(state.status);
    this.memoryStore.upsertFindings(state.findings);
    for (const thread of state.threads) {
      const created = this.memoryStore.createThread(thread.channel, thread.title);
      if (thread.messages.length > 0) {
        this.memoryStore.appendMessages(created.id, thread.messages);
      }
    }
    for (const memory of state.memories) {
      this.memoryStore.addMemory({
        content: memory.content,
        type: memory.type,
        importance: memory.importance,
        metadata: memory.metadata,
      });
    }
  }
}
