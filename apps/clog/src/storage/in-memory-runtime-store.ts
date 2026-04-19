import type {
  ActionExecutionResult,
  AgentFinding,
  AgentStatus,
  ConversationMessage,
  ConversationThoughtStep,
  ConversationThread,
  FindingState,
  ProposedAction,
  SurfaceChannelKind,
} from "@clog/types";
import type { MemoryEntry, RuntimeStore } from "./chat";

export interface PersistedRuntimeState {
  readonly status: AgentStatus;
  readonly findings: readonly AgentFinding[];
  readonly threads: readonly ConversationThread[];
  readonly memories: readonly MemoryEntry[];
  readonly actionResults: readonly ActionExecutionResult[];
}

export const createEmptyRuntimeState = (): PersistedRuntimeState => ({
  status: "booting",
  findings: [],
  threads: [],
  memories: [],
  actionResults: [],
});

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

const sortThreads = (threads: readonly ConversationThread[]): ConversationThread[] =>
  [...threads].sort((left, right) => right.updatedAt - left.updatedAt);

export class InMemoryRuntimeStore implements RuntimeStore {
  private status: AgentStatus = "booting";
  private findings = new Map<string, AgentFinding>();
  private threads = new Map<string, ConversationThread>();
  private actionResults = new Map<string, ActionExecutionResult>();
  private memories = new Map<string, MemoryEntry>();

  getStatus(): AgentStatus {
    return this.status;
  }

  setStatus(status: AgentStatus): void {
    this.status = status;
  }

  listFindings(): AgentFinding[] {
    return [...this.findings.values()].sort((left, right) => right.lastSeenAt - left.lastSeenAt);
  }

  upsertFindings(findings: readonly AgentFinding[]): void {
    for (const finding of findings) {
      this.findings.set(finding.id, finding);
    }
  }

  acknowledgeFinding(findingId: string): AgentFinding | null {
    const finding = this.findings.get(findingId);
    if (!finding) {
      return null;
    }

    const updated: AgentFinding = {
      ...finding,
      state: "acknowledged",
      lastSeenAt: Date.now(),
    };
    this.findings.set(updated.id, updated);
    return updated;
  }

  resolveFindingState(findingId: string, state: FindingState): AgentFinding | null {
    const finding = this.findings.get(findingId);
    if (!finding) {
      return null;
    }

    const updated: AgentFinding = {
      ...finding,
      state,
      lastSeenAt: Date.now(),
    };
    this.findings.set(updated.id, updated);
    return updated;
  }

  listThreads(): ConversationThread[] {
    return sortThreads([...this.threads.values()]);
  }

  getThread(threadId: string): ConversationThread | null {
    return this.threads.get(threadId) ?? null;
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
    this.threads.set(thread.id, thread);
    return thread;
  }

  appendMessages(threadId: string, messages: readonly ConversationMessage[]): ConversationThread {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    const next: ConversationThread = {
      ...thread,
      updatedAt: Date.now(),
      messages: [...thread.messages, ...messages],
    };
    this.threads.set(threadId, next);
    return next;
  }

  createMessage(
    role: ConversationMessage["role"],
    channel: SurfaceChannelKind,
    content: string,
    reasoning?: string | null,
    thoughts?: readonly ConversationThoughtStep[] | null,
  ): ConversationMessage {
    return {
      id: createId("msg"),
      role,
      channel,
      content,
      ...(reasoning?.trim() ? { reasoning: reasoning.trim() } : {}),
      ...(thoughts && thoughts.length > 0 ? { thoughts: [...thoughts] } : {}),
      createdAt: Date.now(),
    };
  }

  listActionResults(): ActionExecutionResult[] {
    return [...this.actionResults.values()];
  }

  rememberActionResult(result: ActionExecutionResult): void {
    this.actionResults.set(result.actionId, result);
  }

  getActionResult(actionId: string): ActionExecutionResult | null {
    return this.actionResults.get(actionId) ?? null;
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
      "Clogis online. This thread will carry operator notifications, follow-up questions, and approval prompts.",
    );
    return this.appendMessages(thread.id, [intro]);
  }

  listActions(): ProposedAction[] {
    return this.listFindings().flatMap((finding) => finding.proposedActions);
  }

  listMemories(): MemoryEntry[] {
    return [...this.memories.values()].sort((left, right) => right.importance - left.importance);
  }

  addMemory(memory: Omit<MemoryEntry, "id" | "createdAt">): MemoryEntry {
    const entry: MemoryEntry = {
      ...memory,
      id: `mem_${crypto.randomUUID()}`,
      createdAt: Date.now(),
    };
    this.memories.set(entry.id, entry);
    return entry;
  }

  exportState(): PersistedRuntimeState {
    return {
      status: this.status,
      findings: this.listFindings(),
      threads: this.listThreads(),
      memories: this.listMemories(),
      actionResults: this.listActionResults(),
    };
  }

  importState(input: PersistedRuntimeState): void {
    const state = {
      ...createEmptyRuntimeState(),
      ...input,
    };
    this.status = state.status;
    this.findings = new Map(state.findings.map((finding) => [finding.id, finding]));
    this.threads = new Map(state.threads.map((thread) => [thread.id, thread]));
    this.actionResults = new Map(state.actionResults.map((result) => [result.actionId, result]));
    this.memories = new Map(state.memories.map((memory) => [memory.id, memory]));
  }
}
