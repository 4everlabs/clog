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
  readonly runtimeContext?: string | null;
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

type BrainFallbackReason = "missing_api_key" | "model_unavailable";

interface BrainModelPayload {
  readonly systemPrompt: string;
  readonly messages: readonly ModelMessage[];
}

type FetchFn = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

const writeStdoutLine = (value: string): void => {
  process.stdout.write(`${value}\n`);
};

const writeStderrLine = (value: string): void => {
  process.stderr.write(`${value}\n`);
};

export class BrainService {
  private readonly temperature: number;
  private readonly modelName: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly aiConfig: AiRuntimeConfig | null;
  private readonly executionMode: AgentExecutionMode;
  private readonly availableTools: readonly ToolSummary[];
  private readonly runtimeContext: string | null;
  private readonly registeredTools: readonly AnyRegisteredTool[];
  private readonly providerTools: readonly ProviderFunctionTool[];
  private readonly toolExecutor: ToolExecutor | null;
  private readonly fetchFn: FetchFn;
  private readonly maxToolRounds = 20;
  private readonly maxOutputTokens = 12_000;
  private readonly maxConversationContextTokens = 1_000;

  constructor(config: BrainServiceConfig = {}) {
    const aiConfig = config.aiConfig;
    this.aiConfig = aiConfig ?? null;
    this.apiKey = config.apiKey ?? aiConfig?.apiKey ?? "";
    this.temperature = config.temperature ?? 0.3;
    this.modelName = config.modelName ?? aiConfig?.model ?? "gpt-4o-mini";
    this.baseUrl = config.baseUrl ?? aiConfig?.baseUrl ?? "https://api.openai.com/v1";
    this.executionMode = config.executionMode ?? "propose";
    this.availableTools = config.availableTools ?? [];
    this.runtimeContext = config.runtimeContext ?? null;
    this.registeredTools = config.registeredTools ?? [];
    this.providerTools = config.providerTools ?? [];
    this.toolExecutor = config.toolExecutor ?? null;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async reply(input: BrainReplyInput): Promise<string> {
    if (!this.apiKey) {
      return this.buildFallbackReply(input.findings, "missing_api_key");
    }

    try {
      const payload = this.buildModelPayload(input.thread, input.findings);
      this.logModelDispatch(payload);
      return await this.requestLiveReply(payload);
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      writeStderrLine(`[brain] Falling back to local reply: ${message}`);
      return this.buildFallbackReply(input.findings, "model_unavailable");
    }
  }

  private buildModelPayload(thread: ConversationThread, findings: readonly AgentFinding[]): BrainModelPayload {
    const promptBundle = loadAiPromptBundle();
    const threadRuntimeContext = [
      `Current thread id: ${thread.id}`,
      `Current thread title: ${thread.title}`,
      `Current thread channel: ${thread.channel}`,
      `Current thread message count: ${thread.messages.length}`,
      "Use runtime_search_messages when you need to locate a specific part of the conversation before reading more deeply.",
      "Use runtime_get_conversation with this thread id when you need to read more history than was served in-context.",
      "If runtime_get_conversation returns nextRequest, keep following it until you have enough context.",
    ].join("\n");
    const systemPrompt = buildSystemPrompt(promptBundle, {
      tools: this.availableTools,
      includeKnowledgePrompt: false,
      executionMode: this.executionMode,
      findingsSummary: this.buildFindingsSummary(findings),
      runtimeContext: this.runtimeContext?.trim()
        ? `${this.runtimeContext}\n\n${threadRuntimeContext}`
        : threadRuntimeContext,
      wakeupPrompt: promptBundle.wakeupPrompt,
    });

    return {
      systemPrompt,
      messages: this.mapThreadMessages(thread.messages),
    };
  }

  private logModelDispatch(payload: BrainModelPayload): void {
    writeStdoutLine(`[brain] dispatching model payload ${JSON.stringify({
      provider: this.aiConfig?.provider ?? "direct",
      model: this.modelName,
      toolNames: this.registeredTools.map((registeredTool) => registeredTool.name),
      systemPromptChars: payload.systemPrompt.length,
      systemPromptEstimatedTokens: this.estimateMessageTokens(payload.systemPrompt),
      messageCount: payload.messages.length,
      messageRoles: payload.messages.map((message) => message.role),
      messageEstimatedTokens: payload.messages.reduce((total, message) => {
        const content = typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content);
        return total + this.estimateMessageTokens(content);
      }, 0),
      latestMessageChars: payload.messages.length > 0
        ? (
            typeof payload.messages[payload.messages.length - 1]!.content === "string"
              ? payload.messages[payload.messages.length - 1]!.content.length
              : JSON.stringify(payload.messages[payload.messages.length - 1]!.content).length
          )
        : 0,
    }, null, 2)}`);
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

  private async requestLiveReply(payload: BrainModelPayload): Promise<string> {
    const response = (await this.callLlm(payload.systemPrompt, payload.messages)).trim();
    if (response) {
      return response;
    }

    throw new Error("Model returned an empty response");
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
      maxOutputTokens: this.maxOutputTokens,
      tools,
      stopWhen: tools ? stepCountIs(this.maxToolRounds) : undefined,
    });

    const primaryText = result.text.trim();
    if (primaryText) {
      return primaryText;
    }

    if (result.toolResults.length === 0) {
      return "";
    }

    const followup = await generateText({
      model: openrouter.chat(this.modelName),
      system: systemPrompt,
      messages: [
        ...messages,
        ...result.response.messages,
        {
          role: "user",
          content: "Now provide a direct operator-facing summary based only on the gathered tool results. Do not call tools again. Start with the most important update.",
        },
      ],
      temperature: this.temperature,
      maxOutputTokens: this.maxOutputTokens,
    });

    return followup.text.trim();
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
      maxTokens: this.maxOutputTokens,
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

  private buildFallbackReply(
    findings: readonly AgentFinding[],
    reason: BrainFallbackReason,
  ): string {
    const openFindings = findings.filter((finding) => finding.state === "open");
    const highestPriority = openFindings[0];
    const lead = reason === "missing_api_key"
      ? "I don't have a live AI provider configured right now."
      : "I couldn't get a live model answer just now.";

    if (!highestPriority) {
      return `${lead} There are no active findings right now. Ask me to inspect runtime health or run another monitoring cycle if you want a fresh check.`;
    }

    return `${lead} The highest-priority open finding is "${highestPriority.title}". The safest next step is to review that finding and decide whether to investigate, notify, or prepare a follow-up action.`;
  }
}
