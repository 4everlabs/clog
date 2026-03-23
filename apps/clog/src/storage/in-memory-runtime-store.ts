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

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

const sortThreads = (threads: readonly ConversationThread[]): ConversationThread[] =>
  [...threads].sort((left, right) => right.updatedAt - left.updatedAt);

export class InMemoryRuntimeStore {
  private status: AgentStatus = "booting";
  private findings = new Map<string, AgentFinding>();
  private threads = new Map<string, ConversationThread>();
  private actionResults = new Map<string, ActionExecutionResult>();

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
      "PostHog Claw is online. This thread will carry operator notifications, follow-up questions, and approval prompts.",
    );
    return this.appendMessages(thread.id, [intro]);
  }

  listActions(): ProposedAction[] {
    return this.listFindings().flatMap((finding) => finding.proposedActions);
  }
}
