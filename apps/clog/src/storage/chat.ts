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

export interface MemoryEntry {
  id: string;
  content: string;
  type: "observation" | "finding" | "conversation" | "insight";
  importance: number;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface RuntimeStore {
  getStatus(): AgentStatus;
  setStatus(status: AgentStatus): void;
  listFindings(): AgentFinding[];
  upsertFindings(findings: readonly AgentFinding[]): void;
  acknowledgeFinding(findingId: string): AgentFinding | null;
  resolveFindingState(findingId: string, state: FindingState): AgentFinding | null;
  listThreads(): ConversationThread[];
  getThread(threadId: string): ConversationThread | null;
  createThread(channel: SurfaceChannelKind, title: string): ConversationThread;
  appendMessages(threadId: string, messages: readonly ConversationMessage[]): ConversationThread;
  createMessage(
    role: ConversationMessage["role"],
    channel: SurfaceChannelKind,
    content: string,
    reasoning?: string | null,
    thoughts?: readonly ConversationThoughtStep[] | null,
  ): ConversationMessage;
  listActionResults(): ActionExecutionResult[];
  rememberActionResult(result: ActionExecutionResult): void;
  getActionResult(actionId: string): ActionExecutionResult | null;
  seedOperatorThread(channel: SurfaceChannelKind, title?: string): ConversationThread;
  listActions(): ProposedAction[];
  listMemories(): MemoryEntry[];
  addMemory(memory: Omit<MemoryEntry, "id" | "createdAt">): MemoryEntry;
}
