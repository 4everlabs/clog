import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  ActionExecutionResult,
  AgentFinding,
  AgentStatus,
  ConversationMessage,
  ConversationThoughtStep,
  ConversationThread,
} from "@clog/types";
import type { RuntimeStorageConfig } from "../runtime/config";
import { createEmptyRuntimeState, InMemoryRuntimeStore, type PersistedRuntimeState } from "./in-memory-runtime-store";
import type { MemoryEntry, RuntimeStore } from "./chat";

interface StoredStatus {
  readonly status: AgentStatus;
}

interface RuntimeStatePaths {
  readonly status: string;
  readonly findings: string;
  readonly threads: string;
  readonly memories: string;
  readonly actionResults: string;
}

interface ConversationPaths {
  readonly conversationId: string;
  readonly directory: string;
  readonly notes: string;
  readonly chat: string;
}

const CONVERSATIONS_DIRECTORY_NAME = "conversations";
const NOTES_FILE_NAME = "notes.jsonl";
const CHAT_FILE_NAME = "chat.jsonl";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isAgentStatus = (value: unknown): value is AgentStatus =>
  value === "booting" || value === "idle" || value === "monitoring" || value === "degraded";

const readOptionalJson = (path: string): unknown | null => {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf-8")) as unknown;
};

const readOptionalText = (path: string): string | null => {
  if (!existsSync(path)) {
    return null;
  }

  return readFileSync(path, "utf-8");
};

const writeJsonAtomically = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;

  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
    renameSync(temporaryPath, path);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
};

const readStoredStatus = (path: string): AgentStatus | null => {
  const value = readOptionalJson(path);
  if (!isRecord(value) || !isAgentStatus(value.status)) {
    return null;
  }

  const storedStatus = value as unknown as StoredStatus;
  return storedStatus.status;
};

const readStoredCollection = <T>(path: string): readonly T[] | null => {
  const value = readOptionalJson(path);
  return Array.isArray(value) ? (value as readonly T[]) : null;
};

const createStatePaths = (stateDir: string): RuntimeStatePaths => ({
  status: join(stateDir, "status.json"),
  findings: join(stateDir, "findings.json"),
  threads: join(stateDir, "threads.json"),
  memories: join(stateDir, "memories.json"),
  actionResults: join(stateDir, "action-results.json"),
});

const formatTimestampSegment = (value: number): string =>
  new Date(value).toISOString().replaceAll(":", "-").replaceAll(".", "-");

const sanitizePathSegment = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");

const createConversationId = (thread: ConversationThread): string =>
  `conversation-${formatTimestampSegment(thread.createdAt)}-${sanitizePathSegment(thread.id)}`;

const createConversationPaths = (storageDir: string, thread: ConversationThread): ConversationPaths => {
  const conversationId = createConversationId(thread);
  const directory = join(storageDir, CONVERSATIONS_DIRECTORY_NAME, conversationId);
  return {
    conversationId,
    directory,
    notes: join(directory, NOTES_FILE_NAME),
    chat: join(directory, CHAT_FILE_NAME),
  };
};

const serializeJsonl = (entries: readonly unknown[]): string => {
  if (entries.length === 0) {
    return "";
  }

  return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
};

const ensureTextFile = (path: string, content: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf-8");
};

const createConversationHeader = (
  thread: ConversationThread,
  conversationId: string,
  fileKind: "notes" | "chat",
) => ({
  type: "conversation-header",
  schemaVersion: 1,
  fileKind,
  conversationId,
  threadId: thread.id,
  channel: thread.channel,
  title: thread.title,
  createdAt: thread.createdAt,
  updatedAt: thread.updatedAt,
});

const createChatEntries = (thread: ConversationThread, conversationId: string): readonly unknown[] => [
  createConversationHeader(thread, conversationId, "chat"),
  ...thread.messages.map((message) => ({
    type: "message",
    conversationId,
    threadId: thread.id,
    messageId: message.id,
    role: message.role,
    channel: message.channel,
    content: message.content,
    ...(message.reasoning ? { reasoning: message.reasoning } : {}),
    ...(message.thoughts?.length ? { thoughts: message.thoughts } : {}),
    createdAt: message.createdAt,
  })),
];

export class FileRuntimeStore implements RuntimeStore {
  readonly config: RuntimeStorageConfig;
  private readonly memoryStore = new InMemoryRuntimeStore();
  private readonly paths: RuntimeStatePaths;

  constructor(config: RuntimeStorageConfig) {
    this.config = config;
    this.paths = createStatePaths(config.stateDir);
    mkdirSync(config.stateDir, { recursive: true });
    mkdirSync(join(config.storageDir, CONVERSATIONS_DIRECTORY_NAME), { recursive: true });
    this.restore();
  }

  close(): void {
    this.persist();
  }

  getStatus(): AgentStatus {
    return this.memoryStore.getStatus();
  }

  setStatus(status: AgentStatus): void {
    this.memoryStore.setStatus(status);
    this.persist();
  }

  listFindings(): AgentFinding[] {
    return this.memoryStore.listFindings();
  }

  upsertFindings(findings: readonly AgentFinding[]): void {
    this.memoryStore.upsertFindings(findings);
    this.persist();
  }

  acknowledgeFinding(findingId: string): AgentFinding | null {
    const result = this.memoryStore.acknowledgeFinding(findingId);
    this.persist();
    return result;
  }

  resolveFindingState(findingId: string, state: AgentFinding["state"]): AgentFinding | null {
    const result = this.memoryStore.resolveFindingState(findingId, state);
    this.persist();
    return result;
  }

  listThreads(): ConversationThread[] {
    return this.memoryStore.listThreads();
  }

  getThread(threadId: string): ConversationThread | null {
    return this.memoryStore.getThread(threadId);
  }

  createThread(channel: ConversationThread["channel"], title: string): ConversationThread {
    const thread = this.memoryStore.createThread(channel, title);
    this.persist();
    return thread;
  }

  appendMessages(threadId: string, messages: readonly ConversationMessage[]): ConversationThread {
    const thread = this.memoryStore.appendMessages(threadId, messages);
    this.persist();
    return thread;
  }

  createMessage(
    role: ConversationMessage["role"],
    channel: ConversationMessage["channel"],
    content: string,
    reasoning?: string | null,
    thoughts?: readonly ConversationThoughtStep[] | null,
  ): ConversationMessage {
    return this.memoryStore.createMessage(role, channel, content, reasoning, thoughts);
  }

  listActionResults(): ActionExecutionResult[] {
    return this.memoryStore.listActionResults();
  }

  rememberActionResult(result: ActionExecutionResult): void {
    this.memoryStore.rememberActionResult(result);
    this.persist();
  }

  getActionResult(actionId: string): ActionExecutionResult | null {
    return this.memoryStore.getActionResult(actionId);
  }

  seedOperatorThread(channel: ConversationThread["channel"], title?: string): ConversationThread {
    const thread = this.memoryStore.seedOperatorThread(channel, title);
    this.persist();
    return thread;
  }

  listActions() {
    return this.memoryStore.listActions();
  }

  listMemories(): MemoryEntry[] {
    return this.memoryStore.listMemories();
  }

  addMemory(memory: Omit<MemoryEntry, "id" | "createdAt">): MemoryEntry {
    const entry = this.memoryStore.addMemory(memory);
    this.persist();
    return entry;
  }

  private persist(): void {
    const state = this.memoryStore.exportState();
    writeJsonAtomically(this.paths.status, { status: state.status });
    writeJsonAtomically(this.paths.findings, state.findings);
    writeJsonAtomically(this.paths.threads, state.threads);
    writeJsonAtomically(this.paths.memories, state.memories);
    writeJsonAtomically(this.paths.actionResults, state.actionResults);
    this.persistConversationFiles(state.threads);
  }

  private restore(): void {
    const state = this.readStructuredState() ?? createEmptyRuntimeState();
    this.memoryStore.importState(state);
    this.persist();
  }

  private readStructuredState(): PersistedRuntimeState | null {
    const hasStructuredState = Object.values(this.paths).some((path) => existsSync(path));
    if (!hasStructuredState) {
      return null;
    }

    return {
      status: readStoredStatus(this.paths.status) ?? "booting",
      findings: readStoredCollection<AgentFinding>(this.paths.findings) ?? [],
      threads: readStoredCollection<ConversationThread>(this.paths.threads) ?? [],
      memories: readStoredCollection<MemoryEntry>(this.paths.memories) ?? [],
      actionResults: readStoredCollection<ActionExecutionResult>(this.paths.actionResults) ?? [],
    };
  }

  private persistConversationFiles(threads: readonly ConversationThread[]): void {
    for (const thread of threads) {
      const paths = createConversationPaths(this.config.storageDir, thread);
      const existingNotes = readOptionalText(paths.notes);

      if (!existingNotes || existingNotes.trim().length === 0) {
        ensureTextFile(
          paths.notes,
          serializeJsonl([createConversationHeader(thread, paths.conversationId, "notes")]),
        );
      }

      ensureTextFile(paths.chat, serializeJsonl(createChatEntries(thread, paths.conversationId)));
    }
  }
}
