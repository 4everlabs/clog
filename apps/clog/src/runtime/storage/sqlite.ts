import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import type {
  ActionExecutionResult,
  AgentFinding,
  AgentStatus,
  ConversationMessage,
  ConversationThread,
  FindingState,
  ProposedAction,
  SurfaceChannelKind,
} from "@clog/types";
import type { RuntimeStorageConfig } from "../../config";
import { RUNTIME_STORAGE_PRAGMAS, RUNTIME_STORAGE_SCHEMA } from "./schema";
import type { RuntimeStore, MemoryEntry } from "./store";

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

const sortThreads = (threads: readonly ConversationThread[]): ConversationThread[] =>
  [...threads].sort((left, right) => right.updatedAt - left.updatedAt);

const parseJson = <T>(value: string, label: string): T => {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`${label} JSON is corrupted: ${error instanceof Error ? error.message : "unknown error"}`);
  }
};

export class SqliteRuntimeStore implements RuntimeStore {
  private readonly db: Database;

  constructor(readonly config: RuntimeStorageConfig) {
    mkdirSync(dirname(config.databasePath), { recursive: true });
    this.db = new Database(config.databasePath, { create: true, strict: true });
    this.db.exec(RUNTIME_STORAGE_PRAGMAS);
    this.db.exec(RUNTIME_STORAGE_SCHEMA);
    this.ensureMetaDefaults();
  }

  close(): void {
    this.db.close();
  }

  getStatus(): AgentStatus {
    return this.getMeta("status") as AgentStatus ?? "booting";
  }

  setStatus(status: AgentStatus): void {
    this.setMeta("status", status);
  }

  listFindings(): AgentFinding[] {
    const rows = this.db
      .query<{ payload: string }, []>("SELECT payload FROM runtime_findings ORDER BY last_seen_at DESC")
      .all();
    return rows.map((row) => parseJson<AgentFinding>(row.payload, "finding"));
  }

  upsertFindings(findings: readonly AgentFinding[]): void {
    const insert = this.db.query(
      "INSERT OR REPLACE INTO runtime_findings (id, state, first_seen_at, last_seen_at, payload) VALUES (?, ?, ?, ?, ?)",
    );
    const transaction = this.db.transaction((items: readonly AgentFinding[]) => {
      for (const finding of items) {
        insert.run(
          finding.id,
          finding.state,
          finding.firstSeenAt,
          finding.lastSeenAt,
          JSON.stringify(finding),
        );
      }
    });
    transaction(findings);
  }

  acknowledgeFinding(findingId: string): AgentFinding | null {
    return this.updateFindingState(findingId, "acknowledged");
  }

  resolveFindingState(findingId: string, state: FindingState): AgentFinding | null {
    return this.updateFindingState(findingId, state);
  }

  listThreads(): ConversationThread[] {
    const rows = this.db
      .query<{ payload: string }, []>("SELECT payload FROM runtime_threads ORDER BY updated_at DESC")
      .all();
    return sortThreads(rows.map((row) => parseJson<ConversationThread>(row.payload, "thread")));
  }

  getThread(threadId: string): ConversationThread | null {
    const row = this.db
      .query<{ payload: string }, [string]>("SELECT payload FROM runtime_threads WHERE id = ? LIMIT 1")
      .get(threadId);
    return row ? parseJson<ConversationThread>(row.payload, "thread") : null;
  }

  createThread(channel: SurfaceChannelKind, title: string): ConversationThread {
    const now = Date.now();
    const thread: ConversationThread = {
      id: createId("thread"),
      title,
      channel,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    this.persistThread(thread);
    return thread;
  }

  appendMessages(threadId: string, messages: readonly ConversationMessage[]): ConversationThread {
    const thread = this.getThread(threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    const next: ConversationThread = {
      ...thread,
      updatedAt: Date.now(),
      messages: [...thread.messages, ...messages],
    };
    this.persistThread(next);
    return next;
  }

  createMessage(role: ConversationMessage["role"], channel: SurfaceChannelKind, content: string): ConversationMessage {
    return {
      id: createId("msg"),
      role,
      channel,
      content,
      createdAt: Date.now(),
    };
  }

  rememberActionResult(result: ActionExecutionResult): void {
    this.db
      .query("INSERT OR REPLACE INTO runtime_action_results (action_id, payload) VALUES (?, ?)")
      .run(result.actionId, JSON.stringify(result));
  }

  getActionResult(actionId: string): ActionExecutionResult | null {
    const row = this.db
      .query<{ payload: string }, [string]>("SELECT payload FROM runtime_action_results WHERE action_id = ? LIMIT 1")
      .get(actionId);
    return row ? parseJson<ActionExecutionResult>(row.payload, "action result") : null;
  }

  seedOperatorThread(channel: SurfaceChannelKind, title = "Operator Oversight"): ConversationThread {
    const existing = this.listThreads().find((thread) => thread.channel === channel);
    if (existing) {
      return existing;
    }

    const thread = this.createThread(channel, title);
    const intro = this.createMessage(
      "system",
      channel,
      "PostHog Claw is online. This thread will carry operator notifications, follow-up questions, and approval prompts.",
    );
    return this.appendMessages(thread.id, [intro]);
  }

  listActions(): ProposedAction[] {
    return this.listFindings().flatMap((finding) => finding.proposedActions);
  }

  private ensureMetaDefaults(): void {
    if (this.getMeta("status") === null) {
      this.setMeta("status", "booting");
    }
  }

  private getMeta(key: string): string | null {
    const row = this.db
      .query<{ value: string }, [string]>("SELECT value FROM runtime_meta WHERE key = ? LIMIT 1")
      .get(key);
    return row?.value ?? null;
  }

  private setMeta(key: string, value: string): void {
    this.db
      .query("INSERT OR REPLACE INTO runtime_meta (key, value) VALUES (?, ?)")
      .run(key, value);
  }

  private persistThread(thread: ConversationThread): void {
    this.db
      .query(
        "INSERT OR REPLACE INTO runtime_threads (id, channel, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?)",
      )
      .run(thread.id, thread.channel, thread.createdAt, thread.updatedAt, JSON.stringify(thread));
  }

  private updateFindingState(findingId: string, state: FindingState): AgentFinding | null {
    const row = this.db
      .query<{ payload: string }, [string]>("SELECT payload FROM runtime_findings WHERE id = ? LIMIT 1")
      .get(findingId);
    if (!row) {
      return null;
    }

    const finding = parseJson<AgentFinding>(row.payload, "finding");
    const updated: AgentFinding = {
      ...finding,
      state,
      lastSeenAt: Date.now(),
    };
    this.upsertFindings([updated]);
    return updated;
  }

  listMemories(): MemoryEntry[] {
    const rows = this.db
      .query<{ payload: string }, []>("SELECT payload FROM runtime_memories ORDER BY importance DESC, created_at DESC")
      .all();
    return rows.map((row) => parseJson<MemoryEntry>(row.payload, "memory"));
  }

  addMemory(memory: Omit<MemoryEntry, "id" | "createdAt">): MemoryEntry {
    const entry: MemoryEntry = {
      ...memory,
      id: `mem_${crypto.randomUUID()}`,
      createdAt: Date.now(),
    };
    this.persistMemory(entry);
    return entry;
  }

  private persistMemory(memory: MemoryEntry): void {
    this.db
      .query(
        "INSERT OR REPLACE INTO runtime_memories (id, content, type, importance, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(memory.id, memory.content, memory.type, memory.importance, memory.createdAt, JSON.stringify(memory.metadata ?? {}));
  }
}
