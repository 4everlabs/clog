import { zodToJsonSchema } from "zod-to-json-schema";
import type { IntegrationCapabilitySnapshot } from "@clog/types";
import type { ZodTypeAny } from "zod";
import { ProviderFunctionToolSchema, type ProviderFunctionTool } from "../schema/provider";
import { ToolSummarySchema, type AgentToolName, type ToolSummary } from "../schema/tools";
import { githubTools } from "./definitions/github";
import { posthogTools } from "./definitions/posthog";
import { shellTools } from "./definitions/shell";
import { vercelTools } from "./definitions/vercel";
import type { AnyRegisteredTool } from "./types";

const registeredTools: readonly AnyRegisteredTool[] = [
  ...posthogTools,
  ...shellTools,
  ...githubTools,
  ...vercelTools,
];

const toolMap = new Map<AgentToolName, AnyRegisteredTool>(
  registeredTools.map((tool) => [tool.name, tool]),
);

const toToolSummary = (tool: AnyRegisteredTool): ToolSummary =>
  ToolSummarySchema.parse({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    integration: tool.integration,
    approvalRequired: tool.approvalRequired,
    implemented: tool.implemented,
  });

const toProviderFunctionTool = (tool: AnyRegisteredTool): ProviderFunctionTool => {
  const toJsonSchema = zodToJsonSchema as unknown as (
    schema: ZodTypeAny,
    options: {
      readonly target: "openAi";
      readonly $refStrategy: "none";
    },
  ) => Record<string, unknown>;
  const parameters = toJsonSchema(tool.inputSchema as ZodTypeAny, {
    target: "openAi",
    $refStrategy: "none",
  });
  delete parameters.$schema;

  return ProviderFunctionToolSchema.parse({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters,
      strict: true,
    },
  });
};

export const listRegisteredTools = (): readonly AnyRegisteredTool[] => registeredTools;

export const getRegisteredTool = (toolName: AgentToolName): AnyRegisteredTool | null =>
  toolMap.get(toolName) ?? null;

export const resolveEnabledTools = (
  capabilities: IntegrationCapabilitySnapshot,
): readonly AnyRegisteredTool[] =>
  registeredTools.filter((tool) => tool.implemented && tool.isEnabled(capabilities));

export const summarizeEnabledTools = (
  capabilities: IntegrationCapabilitySnapshot,
): readonly ToolSummary[] =>
  resolveEnabledTools(capabilities).map(toToolSummary);

export const buildProviderTools = (
  capabilities: IntegrationCapabilitySnapshot,
): readonly ProviderFunctionTool[] =>
  resolveEnabledTools(capabilities).map(toProviderFunctionTool);
