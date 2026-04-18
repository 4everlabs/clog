import { describe, expect, test } from "bun:test";
import type { IntegrationCapabilitySnapshot } from "@clog/types";
import { buildProviderTools, summarizeAdvertisedTools, summarizeEnabledTools } from "../apps/clog/src/tools/registry";

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
      "posthog_get_info",
      "posthog_get_health_summary",
      "posthog_get_asset_summary",
      "posthog_get_release_summary",
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
      "runtime_get_info",
      "runtime_list_conversations",
      "runtime_get_conversation",
      "runtime_search_messages",
      "runtime_get_recent_logs",
      "runtime_get_monitoring_snapshot",
      "runtime_list_actions",
      "runtime_run_action",
      "runtime_list_routines",
      "runtime_run_routine",
      "runtime_read_knowledge",
      "runtime_read_json",
      "shell_execute_command",
    ]);
  });

  test("builds provider tools from the advertised core set", () => {
    const tools = buildProviderTools(createCapabilities());
    const summaries = summarizeAdvertisedTools(createCapabilities());

    expect(tools.map((tool) => tool.function.name)).toEqual([
      "posthog_list_errors",
      "posthog_get_documented_tool_catalog",
      "posthog_list_mcp_tools",
      "posthog_call_mcp_tool",
      "posthog_get_dashboard_snapshot",
      "posthog_get_info",
      "posthog_get_health_summary",
      "posthog_get_asset_summary",
      "posthog_get_release_summary",
      "notion_get_todo_list",
      "runtime_get_info",
      "runtime_list_conversations",
      "runtime_get_conversation",
      "runtime_search_messages",
      "runtime_read_knowledge",
      "runtime_read_json",
      "shell_execute_command",
    ]);
    expect(summaries.map((tool) => tool.name)).toEqual(tools.map((tool) => tool.function.name));
    expect(tools.every((tool) => tool.type === "function")).toBe(true);
  });

  test("hides PostHog organization discovery tools when context is pinned", () => {
    const summaries = summarizeEnabledTools(createCapabilities(), {
      hidePosthogContextTools: true,
    });
    const tools = buildProviderTools(createCapabilities(), {
      hidePosthogContextTools: true,
    });

    expect(summaries.map((tool) => tool.name)).not.toContain("posthog_get_organizations");
    expect(summaries.map((tool) => tool.name)).not.toContain("posthog_get_projects");
    expect(tools.map((tool) => tool.function.name)).not.toContain("posthog_get_organizations");
    expect(tools.map((tool) => tool.function.name)).not.toContain("posthog_get_projects");
  });
});
