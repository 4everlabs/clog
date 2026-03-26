import { describe, expect, test } from "bun:test";
import type { IntegrationCapabilitySnapshot } from "@clog/types";
import { buildProviderTools, summarizeEnabledTools } from "../apps/clog/src/tools/registry";

const createCapabilities = (): IntegrationCapabilitySnapshot => ({
  posthog: {
    canReadInsights: true,
    canReadErrors: true,
    canReadLogs: false,
    canReadFlags: false,
    canReadExperiments: false,
    canManageEndpoints: false,
    canUploadSourcemaps: false,
  },
  github: {
    canReadRepository: true,
    canCreatePullRequest: true,
    canPushBranch: true,
  },
  vercel: {
    canTriggerDeploy: true,
  },
  chat: {
    canSendOperatorMessages: true,
    supportedChannels: ["cli"],
  },
  shell: {
    canExecute: true,
    safeCommands: ["ls"],
    safeRoots: ["/tmp"],
  },
});

describe("tool registry", () => {
  test("only exposes implemented enabled tools", () => {
    const summaries = summarizeEnabledTools(createCapabilities());

    expect(summaries.map((tool) => tool.name)).toEqual([
      "posthog_get_organizations",
      "posthog_get_projects",
      "posthog_list_errors",
      "posthog_list_mcp_tools",
      "posthog_call_mcp_tool",
      "posthog_run_query",
      "shell_execute_command",
    ]);
  });

  test("builds provider tools from the same enabled set", () => {
    const tools = buildProviderTools(createCapabilities());

    expect(tools.map((tool) => tool.function.name)).toEqual([
      "posthog_get_organizations",
      "posthog_get_projects",
      "posthog_list_errors",
      "posthog_list_mcp_tools",
      "posthog_call_mcp_tool",
      "posthog_run_query",
      "shell_execute_command",
    ]);
    expect(tools.every((tool) => tool.type === "function")).toBe(true);
  });
});
