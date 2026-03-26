/* eslint-disable no-console */

import { generateText, stepCountIs, tool, type ModelMessage, type ToolSet } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { AgentExecutionMode, AgentFinding, ConversationMessage, ConversationThread } from "@clog/types";
import type { AiRuntimeConfig } from "../config";
import { ToolExecutor } from "../execution/tool-executor";
import type { ProviderFunctionTool, ProviderRequestMessage } from "../schema/provider";
import type { ToolSummary } from "../schema/tools";
import type { AnyRegisteredTool } from "../tools/types";
import {
  buildProviderChatCompletionRequest,
  createProviderToolResultMessage,
  parseProviderAssistantMessage,
} from "./provider-adapter";
import { buildSystemPrompt, loadAiPromptBundle } from "./prompt-loader";

export interface BrainServiceConfig {
  readonly temperature?: number;
  readonly modelName?: string;
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly aiConfig?: AiRuntimeConfig;
  readonly executionMode?: AgentExecutionMode;
  readonly availableTools?: readonly ToolSummary[];
  readonly registeredTools?: readonly AnyRegisteredTool[];
  readonly providerTools?: readonly ProviderFunctionTool[];
  readonly toolExecutor?: ToolExecutor | null;
  readonly fetchFn?: FetchFn;
}

export interface BrainReplyInput {
  readonly thread: ConversationThread;
  readonly message: string;
  readonly findings: readonly AgentFinding[];
}

interface BrainModelPayload {
  readonly systemPrompt: string;
  readonly messages: readonly ModelMessage[];
}

type FetchFn = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

export class BrainService {
  private readonly temperature: number;
  private readonly modelName: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly aiConfig: AiRuntimeConfig | null;
  private readonly executionMode: AgentExecutionMode;
  private readonly availableTools: readonly ToolSummary[];
  private readonly registeredTools: readonly AnyRegisteredTool[];
  private readonly providerTools: readonly ProviderFunctionTool[];
  private readonly toolExecutor: ToolExecutor | null;
  private readonly fetchFn: FetchFn;
  private readonly maxToolRounds = 5;
  private readonly maxConversationContextTokens = 2_000;

  constructor(config: BrainServiceConfig = {}) {
    const aiConfig = config.aiConfig;
    this.aiConfig = aiConfig ?? null;
    this.apiKey = config.apiKey ?? aiConfig?.apiKey ?? "";
    this.temperature = config.temperature ?? 0.3;
    this.modelName = config.modelName ?? aiConfig?.model ?? "gpt-4o-mini";
    this.baseUrl = config.baseUrl ?? aiConfig?.baseUrl ?? "https://api.openai.com/v1";
    this.executionMode = config.executionMode ?? "propose";
    this.availableTools = config.availableTools ?? [];
    this.registeredTools = config.registeredTools ?? [];
    this.providerTools = config.providerTools ?? [];
    this.toolExecutor = config.toolExecutor ?? null;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async reply(input: BrainReplyInput): Promise<string> {
    if (!this.apiKey) {
      return this.buildFallbackReply(input.message, input.findings);
    }

    try {
      const payload = this.buildModelPayload(input.thread, input.findings);
      this.logModelDispatch(payload);
      const response = await this.callLlm(payload.systemPrompt, payload.messages);
      return response || this.buildFallbackReply(input.message, input.findings);
    } catch (error) {
      console.error("[brain] Falling back to local reply:", error);
      return this.buildFallbackReply(input.message, input.findings);
    }
  }

  private buildModelPayload(thread: ConversationThread, findings: readonly AgentFinding[]): BrainModelPayload {
    const promptBundle = loadAiPromptBundle();
    const systemPrompt = buildSystemPrompt(promptBundle, {
      tools: this.availableTools,
      executionMode: this.executionMode,
      findingsSummary: this.buildFindingsSummary(findings),
      wakeupPrompt: promptBundle.wakeupPrompt,
    });

    return {
      systemPrompt,
      messages: this.mapThreadMessages(thread.messages),
    };
  }

  private logModelDispatch(payload: BrainModelPayload): void {
    console.log("[brain] dispatching model payload", JSON.stringify({
      provider: this.aiConfig?.provider ?? "direct",
      model: this.modelName,
      toolNames: this.registeredTools.map((registeredTool) => registeredTool.name),
      systemPrompt: payload.systemPrompt,
      messages: payload.messages,
    }, null, 2));
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

  private mapThreadMessages(messages: readonly ConversationMessage[]): ModelMessage[] {
    const eligibleMessages = messages.filter((message) => (
      message.role === "system" || message.role === "user" || message.role === "agent"
    ));
    const selectedMessages: ModelMessage[] = [];
    let usedTokens = 0;

    for (let index = eligibleMessages.length - 1; index >= 0; index -= 1) {
      const message = eligibleMessages[index]!;
      const estimatedTokens = this.estimateMessageTokens(message.content);

      if (selectedMessages.length > 0 && usedTokens + estimatedTokens > this.maxConversationContextTokens) {
        break;
      }

      selectedMessages.push({
        role: message.role === "agent" ? "assistant" : message.role,
        content: message.content,
      });
      usedTokens += estimatedTokens;
    }

    return selectedMessages.reverse();
  }

  private estimateMessageTokens(content: string): number {
    // Keep this intentionally simple: roughly 4 characters per token plus a small per-message overhead.
    return Math.max(1, Math.ceil(content.length / 4) + 8);
  }

  private async callLlm(systemPrompt: string, messages: readonly ModelMessage[]): Promise<string> {
    if (this.aiConfig?.provider === "openrouter") {
      return await this.callOpenRouter(systemPrompt, messages);
    }

    return await this.callProviderApi(this.toProviderMessages(systemPrompt, messages));
  }

  private buildAiSdkTools(): ToolSet | undefined {
    if (!this.toolExecutor || this.registeredTools.length === 0) {
      return undefined;
    }

    return Object.fromEntries(
      this.registeredTools.map((registeredTool) => [
        registeredTool.name,
        tool({
          description: registeredTool.description,
          inputSchema: registeredTool.inputSchema as never,
          execute: async (input: unknown) => {
            const result = await this.toolExecutor!.execute(registeredTool.name, input);
            if (!result.ok) {
              throw new Error(result.error?.message ?? result.content);
            }

            return result.data ?? result.content;
          },
        }),
      ]),
    ) as ToolSet;
  }

  private async callOpenRouter(systemPrompt: string, messages: readonly ModelMessage[]): Promise<string> {
    const openrouter = createOpenRouter({
      apiKey: this.apiKey,
      compatibility: "strict",
      fetch: this.fetchFn as typeof fetch,
      headers: {
        "HTTP-Referer": "https://clog.local",
        "X-Title": "Clog",
      },
    });
    const tools = this.buildAiSdkTools();
    const result = await generateText({
      model: openrouter.chat(this.modelName),
      system: systemPrompt,
      messages: [...messages],
      temperature: this.temperature,
      maxOutputTokens: 1200,
      tools,
      stopWhen: tools ? stepCountIs(this.maxToolRounds) : undefined,
    });

    return result.text.trim();
  }

  private toProviderMessages(
    systemPrompt: string,
    messages: readonly ModelMessage[],
  ): ProviderRequestMessage[] {
    return [
      { role: "system", content: systemPrompt },
      ...messages
        .filter((message): message is Extract<ModelMessage, { role: "system" | "user" | "assistant" }> => (
          message.role === "system" || message.role === "user" || message.role === "assistant"
        ))
        .map((message) => ({
          role: message.role,
          content: typeof message.content === "string"
            ? message.content
            : JSON.stringify(message.content),
        })),
    ];
  }

  private async callProviderApi(messages: ProviderRequestMessage[]): Promise<string> {
    const conversation = [...messages];

    for (let round = 0; round < this.maxToolRounds; round += 1) {
      const assistantMessage = await this.requestAssistantMessage(conversation);
      const toolCalls = assistantMessage.tool_calls ?? [];
      const assistantContent = assistantMessage.content?.trim() ?? "";

      if (toolCalls.length === 0) {
        return assistantContent;
      }

      conversation.push({
        role: "assistant",
        content: assistantContent || null,
        tool_calls: toolCalls,
      });

      if (!this.toolExecutor) {
        throw new Error("Model requested tool execution but no tool executor is configured");
      }

      for (const toolCall of toolCalls) {
        const result = await this.toolExecutor.executeProviderToolCall(toolCall);
        conversation.push(createProviderToolResultMessage(toolCall.id, result.content));
      }
    }

    throw new Error(`Tool loop exceeded ${this.maxToolRounds} rounds`);
  }

  private async requestAssistantMessage(messages: readonly ProviderRequestMessage[]) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    if (this.baseUrl.includes("openrouter")) {
      headers["HTTP-Referer"] = "https://clog.local";
      headers["X-Title"] = "Clog";
    }

    const payload = buildProviderChatCompletionRequest({
      model: this.modelName,
      temperature: this.temperature,
      maxTokens: 1200,
      messages: [...messages],
      tools: this.providerTools.length > 0 ? [...this.providerTools] : undefined,
    });

    const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LLM API error: ${response.status} ${body.slice(0, 500)}`);
    }

    return parseProviderAssistantMessage(await response.json());
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
