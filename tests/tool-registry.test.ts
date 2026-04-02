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
    supportedChannels: ["tui"],
  },
  notion: {
    canReadTodo: true,
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
      "posthog_get_documented_tool_catalog",
      "posthog_list_mcp_tools",
      "posthog_call_mcp_tool",
      "posthog_run_query",
      "posthog_get_dashboard_snapshot",
      "posthog_list_dashboards",
      "posthog_get_dashboard",
      "posthog_list_insights",
      "posthog_get_insight",
      "posthog_search_entities",
      "posthog_read_data_schema",
      "posthog_read_data_warehouse_schema",
      "posthog_execute_sql",
      "posthog_search_docs",
      "notion_get_todo_list",
      "runtime_get_state_snapshot",
      "runtime_get_recent_logs",
      "runtime_get_monitoring_snapshot",
      "runtime_list_actions",
      "runtime_run_action",
      "runtime_list_routines",
      "runtime_run_routine",
      "runtime_read_knowledge",
      "shell_execute_command",
    ]);
  });

  test("builds provider tools from the same enabled set", () => {
    const tools = buildProviderTools(createCapabilities());

    expect(tools.map((tool) => tool.function.name)).toEqual([
      "posthog_get_organizations",
      "posthog_get_projects",
      "posthog_list_errors",
      "posthog_get_documented_tool_catalog",
      "posthog_list_mcp_tools",
      "posthog_call_mcp_tool",
      "posthog_run_query",
      "posthog_get_dashboard_snapshot",
      "posthog_list_dashboards",
      "posthog_get_dashboard",
      "posthog_list_insights",
      "posthog_get_insight",
      "posthog_search_entities",
      "posthog_read_data_schema",
      "posthog_read_data_warehouse_schema",
      "posthog_execute_sql",
      "posthog_search_docs",
      "notion_get_todo_list",
      "runtime_get_state_snapshot",
      "runtime_get_recent_logs",
      "runtime_get_monitoring_snapshot",
      "runtime_list_actions",
      "runtime_run_action",
      "runtime_list_routines",
      "runtime_run_routine",
      "runtime_read_knowledge",
      "shell_execute_command",
    ]);
    expect(tools.every((tool) => tool.type === "function")).toBe(true);
  });
});
