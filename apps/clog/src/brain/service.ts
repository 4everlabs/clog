import type { AgentFinding, ConversationMessage, ConversationThread } from "@clog/types";
import { buildSystemPrompt, loadAiPromptBundle } from "./prompt-loader";

interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BrainServiceConfig {
  readonly temperature?: number;
  readonly modelName?: string;
  readonly baseUrl?: string;
  readonly apiKey?: string;
}

export interface BrainReplyInput {
  readonly thread: ConversationThread;
  readonly message: string;
  readonly findings: readonly AgentFinding[];
}

export class BrainService {
  private readonly temperature: number;
  private readonly modelName: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: BrainServiceConfig = {}) {
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    this.apiKey = config.apiKey ?? openrouterKey ?? openaiKey ?? "";
    this.temperature = config.temperature ?? 0.3;
    this.modelName = config.modelName ?? process.env.OPENROUTER_MODEL ?? (openrouterKey ? "stepfun/flash-3.5" : "gpt-4o-mini");
    this.baseUrl = config.baseUrl ?? (openrouterKey ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1");
  }

  async reply(input: BrainReplyInput): Promise<string> {
    if (!this.apiKey) {
      return this.buildFallbackReply(input.message, input.findings);
    }

    try {
      const messages = this.buildMessages(input.thread, input.findings);
      const response = await this.callLlm(messages);
      return response || this.buildFallbackReply(input.message, input.findings);
    } catch (error) {
      console.error("[brain] Falling back to local reply:", error);
      return this.buildFallbackReply(input.message, input.findings);
    }
  }

  private buildMessages(thread: ConversationThread, findings: readonly AgentFinding[]): LlmMessage[] {
    const promptBundle = loadAiPromptBundle();
    const systemPrompt = [
      buildSystemPrompt(promptBundle),
      "",
      promptBundle.primaryModePrompt,
      `Execution mode: ${process.env.POSTHOG_CLAW_EXECUTION_MODE ?? "propose"}`,
      this.buildFindingsSummary(findings),
      promptBundle.wakeupPrompt ? `Shared wakeup guidance:\n${promptBundle.wakeupPrompt}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return [
      { role: "system", content: systemPrompt },
      ...this.mapThreadMessages(thread.messages),
    ];
  }

  private buildFindingsSummary(findings: readonly AgentFinding[]): string {
    const openFindings = findings.filter((finding) => finding.state === "open").slice(0, 5);
    if (openFindings.length === 0) {
      return "No active findings are currently open.";
    }

    const lines = ["Active findings:"];
    for (const finding of openFindings) {
      lines.push(`- [${finding.severity}] ${finding.title}: ${finding.summary}`);
    }
    return lines.join("\n");
  }

  private mapThreadMessages(messages: readonly ConversationMessage[]): LlmMessage[] {
    return messages
      .filter((message): message is ConversationMessage & { role: "system" | "user" | "assistant" } =>
        message.role === "system" || message.role === "user" || message.role === "assistant",
      )
      .slice(-20)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
  }

  private async callLlm(messages: LlmMessage[]): Promise<string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    if (this.baseUrl.includes("openrouter")) {
      headers["HTTP-Referer"] = "https://clog.local";
      headers["X-Title"] = "Clog";
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.modelName,
        temperature: this.temperature,
        max_tokens: 1200,
        messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LLM API error: ${response.status} ${body.slice(0, 500)}`);
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string | null;
        };
      }>;
    };

    return data.choices?.[0]?.message?.content?.trim() ?? "";
  }

  private buildFallbackReply(message: string, findings: readonly AgentFinding[]): string {
    const openFindings = findings.filter((finding) => finding.state === "open");
    const highestPriority = openFindings[0];

    if (!highestPriority) {
      return `I heard: "${message}". There are no active findings right now, so the clean next step is to inspect runtime health or run another monitoring cycle.`;
    }

    return `I heard: "${message}". The highest-priority open finding is "${highestPriority.title}". The safest next step is to review that finding and decide whether to investigate, notify, or prepare a follow-up action.`;
  }
}
