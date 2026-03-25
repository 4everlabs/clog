import type { AgentFinding, ConversationMessage } from "@clog/types";
import type { RuntimeStore } from "../../storage/store";

export interface MemoryEntry {
  id: string;
  content: string;
  type: "observation" | "finding" | "conversation" | "insight";
  importance: number;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface ContextBundle {
  messages: ConversationMessage[];
  memories: MemoryEntry[];
  findings: AgentFinding[];
  systemPrompt: string;
  tools: string[];
}

export interface ContextAssemblerDeps {
  store: RuntimeStore;
  workspaceRoot: string;
}

export class ContextAssembler {
  constructor(private readonly deps: ContextAssemblerDeps) {}

  async assemble(input: {
    threadId: string;
    task: string;
    includeFindings?: boolean;
    includeMemories?: boolean;
  }): Promise<ContextBundle> {
    const { threadId, task, includeFindings = true, includeMemories = true } = input;

    const thread = this.deps.store.getThread(threadId);
    const messages: ConversationMessage[] = thread?.messages ? [...thread.messages] : [];

    const memories = includeMemories ? await this.recall(task) : [];
    const findings = includeFindings 
      ? this.deps.store.listFindings().filter((f) => f.state === "open")
      : [];

    return {
      messages,
      memories,
      findings,
      systemPrompt: this.loadBrainPrompt(),
      tools: [],
    };
  }

  async recall(query: string, limit = 5): Promise<MemoryEntry[]> {
    const allMemories = this.deps.store.listMemories?.() ?? [];
    
    if (allMemories.length === 0) {
      return [];
    }

    const queryLower = query.toLowerCase();
    const scored = allMemories.map((m) => ({
      entry: m,
      score: this.calculateRelevance(m.content, queryLower),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.entry);
  }

  private calculateRelevance(content: string, query: string): number {
    const contentLower = content.toLowerCase();
    const queryTerms = query.split(/\s+/);
    let score = 0;

    for (const term of queryTerms) {
      if (contentLower.includes(term)) {
        score += 1;
      }
    }

    return score;
  }

  private loadBrainPrompt(): string {
    return `You are Clog, a PostHog-driven oversight agent. 
- Monitor PostHog data, Vercel deployments, and GitHub activity
- Help build dashboards, analyze errors, and keep systems healthy
- Operating mode: ${process.env.POSTHOG_CLAW_EXECUTION_MODE ?? "propose"}

CRITICAL RULES:
1. Never execute high-risk actions without approval
2. Always explain what you're doing before taking action
3. Use tools to gather data - don't guess`;
  }

  async storeMemory(entry: Omit<MemoryEntry, "id" | "createdAt">): Promise<MemoryEntry> {
    const memory: MemoryEntry = {
      ...entry,
      id: `mem_${crypto.randomUUID()}`,
      createdAt: Date.now(),
    };
    
    this.deps.store.addMemory?.(memory);
    return memory;
  }
}
