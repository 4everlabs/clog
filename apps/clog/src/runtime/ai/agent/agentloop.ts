import { z } from "zod";
import type { AgentFinding, ConversationMessage } from "@clog/types";
import type { ToolExecutionResult } from "../tools/registry";
import { ToolRegistry } from "../tools/registry";
import { ContextAssembler } from "./context-assembler";

export interface AgentLoopConfig {
  maxIterations: number;
  temperature: number;
  modelName: string;
  baseUrl: string;
}

export interface AgentTurnInput {
  task: string;
  threadId: string;
  attachments?: AgentFinding[];
}

export interface AgentTurnOutput {
  finalResponse: string;
  toolExecutions: ToolExecutionLog[];
  iterations: number;
}

export interface ToolExecutionLog {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  success: boolean;
}

interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export class AgentLoop {
  private readonly toolRegistry: ToolRegistry;
  private readonly contextAssembler: ContextAssembler;
  private readonly config: AgentLoopConfig;
  private readonly apiKey: string;

  constructor(
    toolRegistry: ToolRegistry,
    contextAssembler: ContextAssembler,
    config?: Partial<AgentLoopConfig>,
  ) {
    this.toolRegistry = toolRegistry;
    this.contextAssembler = contextAssembler;

    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    
    this.apiKey = openrouterKey ?? openaiKey ?? "";
    if (!this.apiKey) {
      console.warn("⚠️  No AI API key configured (set OPENROUTER_API_KEY or OPENAI_API_KEY)");
    }

    const defaultModel = openrouterKey ? "stepfun/flash-3.5" : "gpt-4o";
    const defaultBaseUrl = "https://openrouter.ai/api/v1";

    this.config = {
      maxIterations: config?.maxIterations ?? 10,
      temperature: config?.temperature ?? 0.3,
      modelName: config?.modelName ?? process.env.OPENROUTER_MODEL ?? defaultModel,
      baseUrl: config?.baseUrl ?? defaultBaseUrl,
    };
  }

  async run(input: AgentTurnInput): Promise<AgentTurnOutput> {
    if (!this.apiKey) {
      return {
        finalResponse: "No AI API key configured. Please set OPENROUTER_API_KEY.",
        toolExecutions: [],
        iterations: 0,
      };
    }

    const toolExecutions: ToolExecutionLog[] = [];
    let iterations = 0;
    let currentTask = input.task;
    let messages: LLMMessage[] = [];

    const context = await this.contextAssembler.assemble({
      threadId: input.threadId,
      task: input.task,
      includeFindings: true,
      includeMemories: true,
    });

    messages.push({ role: "system", content: this.buildSystemPrompt(context) });

    while (iterations < this.config.maxIterations) {
      iterations++;

      messages.push({ role: "user", content: currentTask });

      const response = await this.callLLM(messages);

      if (!response.tool_calls || response.tool_calls.length === 0) {
        return {
          finalResponse: response.content ?? "No response",
          toolExecutions,
          iterations,
        };
      }

      for (const call of response.tool_calls) {
        const start = Date.now();
        const execLog: ToolExecutionLog = {
          toolName: call.name,
          args: call.args,
          result: null,
          durationMs: 0,
          success: false,
        };

        try {
          const toolResult = await this.toolRegistry.execute(call.name, call.args);
          execLog.result = toolResult.output;
          execLog.success = toolResult.success;
          currentTask = `Tool ${call.name} executed. Result: ${JSON.stringify(toolResult.output)}. Continue with your task or respond to the user.`;
        } catch (error) {
          execLog.result = { error: error instanceof Error ? error.message : "Unknown error" };
          execLog.success = false;
          currentTask = `Tool ${call.name} failed: ${error instanceof Error ? error.message : "Unknown error"}. Explain the issue to the user.`;
        }

        execLog.durationMs = Date.now() - start;
        toolExecutions.push(execLog);

        messages.push({ role: "assistant", content: "" });
        messages.push({
          role: "user",
          content: `Tool ${call.name} returned: ${JSON.stringify(execLog.result)}`,
        });
      }
    }

    return {
      finalResponse: `Reached maximum iterations (${this.config.maxIterations}). Executions: ${toolExecutions.map((e) => e.toolName).join(", ")}`,
      toolExecutions,
      iterations,
    };
  }

  private async callLLM(messages: LLMMessage[]): Promise<{
    content?: string;
    tool_calls?: ToolCall[];
  }> {
    const tools = this.toolRegistry.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: this.zodToJsonSchema(tool.parameters),
    }));

    const isOpenRouter = this.config.baseUrl.includes("openrouter");

    const body: Record<string, unknown> = {
      model: this.config.modelName,
      messages: messages.filter((m) => m.content || m.role !== "assistant"),
      max_tokens: 4096,
      temperature: this.config.temperature,
    };

    if (tools.length > 0) {
      body.tools = tools;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (isOpenRouter) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
      headers["HTTP-Referer"] = "https://clog.local";
      headers["X-Title"] = "Clog";
    } else {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{
            name?: string;
            arguments?: string;
          }>;
        };
      }>;
    };

    let content = "";
    const toolCalls: ToolCall[] = [];

    if (data.choices) {
      for (const choice of data.choices) {
        if (choice.message?.content) {
          content += choice.message.content;
        }
        if (choice.message?.tool_calls) {
          for (const tc of choice.message.tool_calls) {
            toolCalls.push({
              name: tc.name ?? "",
              args: tc.arguments ? JSON.parse(tc.arguments) : {},
            });
          }
        }
      }
    }

    return { content, tool_calls: toolCalls };
  }

  private zodToJsonSchema(schema: z.ZodSchema): unknown {
    return schema.parse({});
  }

  private buildSystemPrompt(context: Awaited<ReturnType<ContextAssembler["assemble"]>>): string {
    const parts: string[] = [];

    parts.push(this.getSystemPrompt());
    parts.push(this.getPrimaryModePrompt());
    parts.push(`Execution mode: ${process.env.POSTHOG_CLAW_EXECUTION_MODE ?? "propose"}`);
    
    if (context.findings.length > 0) {
      parts.push(`\n## Active Findings (${context.findings.length})`);
      for (const f of context.findings.slice(0, 5)) {
        parts.push(`- [${f.severity}] ${f.title}: ${f.summary}`);
      }
    }

    if (context.memories.length > 0) {
      parts.push(`\n## Relevant Context`);
      for (const m of context.memories.slice(0, 3)) {
        parts.push(`- ${m.content.slice(0, 200)}`);
      }
    }

    parts.push(`\n## Available Tools`);
    for (const tool of this.toolRegistry.list()) {
      parts.push(`- ${tool.name}: ${tool.description}`);
    }

    return parts.join("\n");
  }

  private getSystemPrompt(): string {
    return `You are Clog, a PostHog-driven oversight agent. You monitor PostHog data, Vercel deployments, and GitHub activity. You help build dashboards, analyze errors, and keep systems healthy.

CRITICAL RULES:
1. Never execute high-risk actions without approval (deploys, PRs, config changes)
2. Always explain what you're doing before taking action
3. Use tools to gather data - don't guess
4. Keep responses concise and actionable
5. If unsure, ask the operator for guidance`;
  }

  private getPrimaryModePrompt(): string {
    const mode = process.env.POSTHOG_CLAW_EXECUTION_MODE ?? "propose";
    return `Operating mode: \`${mode}\`. 
- \`observe\`: Watch and report only
- \`propose\`: Suggest actions but don't execute
- \`execute\`: Can execute approved actions

Current mode requires explicit approval for: deployments, PR creation, configuration changes, and shell commands outside read-only operations.`;
  }
}
