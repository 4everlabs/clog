import { ProviderToolCallSchema, type ProviderToolCall } from "./schema/provider";
import { AgentToolNameSchema, ToolExecutionResultEnvelopeSchema } from "./schema/tools";
import { getRegisteredTool, summarizeEnabledTools } from "./registry";
import type { ExecutedToolCall, ToolExecutionContext } from "./types";

const serializeToolData = (value: unknown): string => {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
};

const createToolError = (toolName: string, code: string, message: string): ExecutedToolCall => {
  const normalizedName = AgentToolNameSchema.parse(toolName);
  const tool = getRegisteredTool(normalizedName);
  if (!tool) {
    throw new Error(`Tool not registered: ${normalizedName}`);
  }

  const content = JSON.stringify({
    ok: false,
    error: {
      code,
      message,
    },
  }, null, 2);

  return {
    ...ToolExecutionResultEnvelopeSchema.parse({
      toolName: normalizedName,
      ok: false,
      content,
      error: {
        code,
        message,
      },
    }),
    tool: {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      integration: tool.integration,
      exposureTier: tool.exposureTier,
      capabilityGroup: tool.capabilityGroup,
      approvalRequired: tool.approvalRequired,
      implemented: tool.implemented,
    },
  };
};

export class ToolExecutor {
  constructor(private readonly context: ToolExecutionContext) {}

  getEnabledToolSummaries() {
    return summarizeEnabledTools(this.context.capabilities);
  }

  async execute(toolName: string, rawArgs: unknown): Promise<ExecutedToolCall> {
    const normalizedName = AgentToolNameSchema.parse(toolName);
    const tool = getRegisteredTool(normalizedName);
    if (!tool) {
      throw new Error(`Tool not registered: ${normalizedName}`);
    }

    if (!tool.implemented) {
      return createToolError(normalizedName, "tool_not_implemented", `Tool "${normalizedName}" is not implemented in this runtime.`);
    }

    if (!tool.isEnabled(this.context.capabilities)) {
      return createToolError(normalizedName, "tool_disabled", `Tool "${normalizedName}" is disabled by the current runtime configuration.`);
    }

    if (!tool.execute) {
      return createToolError(normalizedName, "tool_missing_executor", `Tool "${normalizedName}" does not have an executor bound.`);
    }

    try {
      const input = tool.inputSchema.parse(rawArgs);
      const data = await tool.execute(this.context.services, input);
      const parsedData = tool.outputSchema.parse(data);
      return {
        ...ToolExecutionResultEnvelopeSchema.parse({
          toolName: normalizedName,
          ok: true,
          content: serializeToolData(parsedData),
          data: parsedData,
        }),
        tool: {
          name: tool.name,
          title: tool.title,
          description: tool.description,
          integration: tool.integration,
          exposureTier: tool.exposureTier,
          capabilityGroup: tool.capabilityGroup,
          approvalRequired: tool.approvalRequired,
          implemented: tool.implemented,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createToolError(normalizedName, "tool_execution_failed", message);
    }
  }

  async executeProviderToolCall(toolCall: ProviderToolCall): Promise<ExecutedToolCall> {
    const parsedToolCall = ProviderToolCallSchema.parse(toolCall);
    let args: unknown = {};
    try {
      args = parsedToolCall.function.arguments.trim()
        ? JSON.parse(parsedToolCall.function.arguments)
        : {};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createToolError(parsedToolCall.function.name, "tool_arguments_invalid_json", message);
    }

    return await this.execute(parsedToolCall.function.name, args);
  }
}
