import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadAgentEnvironment } from "../apps/clog/src/config";

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (path) {
      rmSync(path, { recursive: true, force: true });
    }
  }
});

describe("loadAgentEnvironment", () => {
  test("parses PostHog runtime config and capabilities", () => {
    const env = loadAgentEnvironment({
      PORT: "3001",
      CLOG_INSTANCE_ID: "config-test-1",
      CLOG_CHANNELS: "telegram,web",
      CLOG_POSTHOG_HOST: "https://eu.posthog.com/",
      POSTHOG_PROJECT_ID: "12345",
      POSTHOG_API_KEY: "phx_test",
      POSTHOG_PROJECT_TOKEN: "phc_test",
      CLOG_POSTHOG_MANAGE_ENDPOINTS: "true",
      CLOG_POSTHOG_UPLOAD_SOURCEMAPS: "true",
      CLOG_POSTHOG_ENABLE_FLAGS: "true",
      CLOG_POSTHOG_READ_FLAGS: "true",
      CLOG_POSTHOG_CLI_TIMEOUT_MS: "45000",
      CLOG_POSTHOG_PRIMARY_INSIGHT_NAME: "Revenue monitor",
      CLOG_POSTHOG_PRIMARY_INSIGHT_QUERY: "SELECT 80 AS current_value, 100 AS previous_value",
      CLOG_POSTHOG_PRIMARY_INSIGHT_REGRESSION_THRESHOLD_PERCENT: "15",
      CLOG_POSTHOG_PRIMARY_INSIGHT_MIN_PREVIOUS_VALUE: "20",
      OPENROUTER_API_KEY: "sk-or-test",
      CLOG_MODEL: "openrouter/test-model",
      NOTION_SECRET: "ntn_test",
      TELEGRAM_BOT_TOKEN: "123456:telegram-test-token",
      TELEGRAM_ALLOWED_CHATS: "1001, 1002",
    });

    expect(env.port).toBe(3001);
    expect(env.channels).toEqual(["telegram", "web"]);
    expect(env.posthog.host).toBe("https://eu.posthog.com");
    expect(env.posthog.projectId).toBe("12345");
    expect(env.posthog.personalApiKey).toBe("phx_test");
    expect(env.posthog.projectApiKey).toBe("phc_test");
    expect(env.posthog.cliTimeoutMs).toBe(45_000);
    expect(env.posthog.requestTimeoutMs).toBe(100_000);
    expect(env.storage.instanceId).toBe("config-test-1");
    expect(env.storage.stateDir.endsWith(".runtime/instances/config-test-1/storage/state")).toBe(true);
    expect(env.posthog.endpointsDir.startsWith(env.storage.workspaceDir)).toBe(true);
    expect(env.posthog.insightMonitors).toHaveLength(1);
    expect(env.posthog.insightMonitors[0]).toMatchObject({
      name: "Revenue monitor",
      regressionThresholdPercent: 15,
      minimumPreviousValue: 20,
    });
    expect(env.ai).toMatchObject({
      provider: "openrouter",
      apiKey: "sk-or-test",
      model: "openrouter/test-model",
      baseUrl: "https://openrouter.ai/api/v1",
    });
    expect(env.telegram).toMatchObject({
      botToken: "123456:telegram-test-token",
      userName: null,
      allowedChatIds: [1001, 1002],
    });
    expect(env.notion).toMatchObject({
      token: "ntn_test",
      todoSearchTitle: "Pre Beta To Do",
    });
    expect(env.capabilities.posthog.canReadInsights).toBe(true);
    expect(env.capabilities.posthog.canReadFlags).toBe(true);
    expect(env.capabilities.posthog.canManageEndpoints).toBe(true);
    expect(env.capabilities.posthog.canUploadSourcemaps).toBe(true);
    expect(env.capabilities.notion.canReadTodo).toBe(true);
    expect(env.availableTools.map((tool) => tool.name)).toEqual([
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
      "posthog_list_feature_flags",
      "posthog_get_feature_flag",
      "posthog_get_feature_flag_status",
      "posthog_get_feature_flag_blast_radius",
      "posthog_search_entities",
      "posthog_read_data_schema",
      "posthog_read_data_warehouse_schema",
      "posthog_execute_sql",
      "posthog_search_docs",
      "posthog_list_endpoints",
      "posthog_diff_endpoints",
      "posthog_run_endpoint",
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
    ]);
  });

  test("disables PostHog management capabilities when credentials are missing", () => {
    const env = loadAgentEnvironment({
      CLOG_INSTANCE_ID: "config-test-2",
      CLOG_POSTHOG_PROJECT_ID: "12345",
    });

    expect(env.channels).toEqual(["tui"]);
    expect(env.capabilities.posthog.canReadInsights).toBe(false);
    expect(env.capabilities.posthog.canReadErrors).toBe(false);
    expect(env.capabilities.posthog.canManageEndpoints).toBe(false);
    expect(env.capabilities.github.canReadRepository).toBe(false);
    expect(env.capabilities.github.canCreatePullRequest).toBe(false);
    expect(env.capabilities.github.canPushBranch).toBe(false);
    expect(env.capabilities.vercel.canTriggerDeploy).toBe(false);
    expect(env.capabilities.shell.canExecute).toBe(false);
    expect(env.availableTools.map((tool) => tool.name)).toEqual([
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
    ]);
  });

  test("defaults to Gemma and auto-enables Telegram when both tokens are present", () => {
    const env = loadAgentEnvironment({
      OPENROUTER_API_KEY: "sk-or-live",
      TELEGRAM_BOT_TOKEN: "123456:telegram-live-token",
      TELEGRAM_BOT_USERNAME: "@clog4everbot",
      CLOG_CHANNELS: "tui",
    });

    expect(env.ai.provider).toBe("openrouter");
    expect(env.ai.model).toBe("google/gemma-4-31b-it:free");
    expect(env.channels).toEqual(["tui", "telegram"]);
    expect(env.telegram.botToken).toBe("123456:telegram-live-token");
    expect(env.telegram.userName).toBe("clog4everbot");
  });

  test("uses CLOG_MODEL when OpenAI is the active provider", () => {
    const env = loadAgentEnvironment({
      OPENAI_API_KEY: "sk-openai-live",
      CLOG_MODEL: "gpt-5-mini",
    });

    expect(env.ai).toMatchObject({
      provider: "openai",
      apiKey: "sk-openai-live",
      model: "gpt-5-mini",
      baseUrl: "https://api.openai.com/v1",
    });
  });

  test("allows overriding the runtime state directory", () => {
    const env = loadAgentEnvironment({
      CLOG_INSTANCE_ID: "operator-1",
      CLOG_RUNTIME_STATE_DIR: "custom-runtime-state",
    });

    expect(env.storage.instanceId).toBe("operator-1");
    expect(env.storage.stateDir.endsWith("custom-runtime-state")).toBe(true);
  });

  test("rejects PostHog endpoint directories outside the runtime workspace", () => {
    expect(() => loadAgentEnvironment({
      CLOG_POSTHOG_ENDPOINTS_DIR: "../outside-endpoints",
    })).toThrow("CLOG_POSTHOG_ENDPOINTS_DIR must stay inside");
  });

  test("reads monitor interval from read-only settings", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clog-config-settings-"));
    cleanupPaths.push(workspaceRoot);

    const settingsDir = join(workspaceRoot, ".runtime", "instances", "personal-instance", "read-only");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, "settings.json"), JSON.stringify({
      monitor: {
        intervalMs: 5000,
      },
    }));

    const previousCwd = process.cwd();
    process.chdir(workspaceRoot);

    try {
      const env = loadAgentEnvironment({});
      expect(env.monitorIntervalMs).toBe(5000);
    } finally {
      process.chdir(previousCwd);
    }
  });

  test("maps runtime defaults from read-only settings", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clog-config-runtime-settings-"));
    cleanupPaths.push(workspaceRoot);

    const settingsDir = join(workspaceRoot, ".runtime", "instances", "personal-instance", "read-only");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, "settings.json"), JSON.stringify({
      app: {
        name: "Ops Clog",
      },
      runtime: {
        executionMode: "execute",
        channels: ["web", "tui"],
        port: 7777,
      },
      monitor: {
        intervalMs: 9000,
      },
      ai: {
        model: "google/gemma-4-26b-a4b-it:free",
      },
      posthog: {
        host: "https://eu.posthog.com/",
        cliTimeoutMs: 45000,
        requestTimeoutMs: 120000,
        enableLogs: true,
      },
      telegram: {
        userName: "@opsclog",
        allowedChatIds: [77, 88],
      },
      notion: {
        requestTimeoutMs: 4000,
        todoSearchTitle: "Ops queue",
      },
    }));

    const previousCwd = process.cwd();
    process.chdir(workspaceRoot);

    try {
      const env = loadAgentEnvironment({
        OPENROUTER_API_KEY: "sk-or-live",
      });

      expect(env.appName).toBe("Ops Clog");
      expect(env.executionMode).toBe("execute");
      expect(env.channels).toEqual(["web", "tui"]);
      expect(env.port).toBe(7777);
      expect(env.monitorIntervalMs).toBe(9000);
      expect(env.ai.model).toBe("google/gemma-4-26b-a4b-it:free");
      expect(env.posthog.host).toBe("https://eu.posthog.com");
      expect(env.posthog.cliTimeoutMs).toBe(45_000);
      expect(env.posthog.requestTimeoutMs).toBe(120_000);
      expect(env.posthog.enableLogs).toBe(true);
      expect(env.telegram.userName).toBe("opsclog");
      expect(env.telegram.allowedChatIds).toEqual([77, 88]);
      expect(env.notion.requestTimeoutMs).toBe(4_000);
      expect(env.notion.todoSearchTitle).toBe("Ops queue");
    } finally {
      process.chdir(previousCwd);
    }
  });

  test("injects pinned PostHog context from read-only settings and hides discovery tools", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clog-config-posthog-context-"));
    cleanupPaths.push(workspaceRoot);

    const settingsDir = join(workspaceRoot, ".runtime", "instances", "personal-instance", "read-only");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, "settings.json"), JSON.stringify({
      posthog: {
        context: "4ever.ai / app.4ever.ai",
      },
    }));

    const previousCwd = process.cwd();
    process.chdir(workspaceRoot);

    try {
      const env = loadAgentEnvironment({
        POSTHOG_PROJECT_ID: "12345",
        POSTHOG_API_KEY: "phx_test",
      CLOG_POSTHOG_MANAGE_ENDPOINTS: "true",
      CLOG_POSTHOG_ENABLE_FLAGS: "true",
      CLOG_POSTHOG_READ_FLAGS: "true",
      NOTION_SECRET: "ntn_test",
      });

      expect(env.runtimeContext).toBe("PostHog context: 4ever.ai / app.4ever.ai");
      expect(env.hidePosthogContextTools).toBe(true);
      expect(env.availableTools.map((tool) => tool.name)).toEqual([
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
        "posthog_list_feature_flags",
        "posthog_get_feature_flag",
        "posthog_get_feature_flag_status",
        "posthog_get_feature_flag_blast_radius",
        "posthog_search_entities",
        "posthog_read_data_schema",
        "posthog_read_data_warehouse_schema",
        "posthog_execute_sql",
        "posthog_search_docs",
        "posthog_list_endpoints",
        "posthog_diff_endpoints",
        "posthog_run_endpoint",
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
      ]);
    } finally {
      process.chdir(previousCwd);
    }
  });

  test("uses read-only tools config to control visible tool capabilities", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clog-config-"));
    cleanupPaths.push(workspaceRoot);

    const toolsDir = join(workspaceRoot, ".runtime", "instances", "personal-instance", "read-only");
    mkdirSync(toolsDir, { recursive: true });
    writeFileSync(join(toolsDir, "tools.json"), JSON.stringify({
      posthog: {
        readInsights: true,
        readErrors: true,
        readLogs: false,
      },
      github: {
        readRepository: false,
        createPullRequests: false,
        pushBranches: false,
      },
      vercel: {
        triggerDeploys: false,
      },
      shell: {
        execute: false,
      },
      notion: {
        readTodo: false,
      },
    }));

    const previousCwd = process.cwd();
    process.chdir(workspaceRoot);

    try {
      const env = loadAgentEnvironment({
        POSTHOG_PROJECT_ID: "12345",
        POSTHOG_API_KEY: "phx_test",
        CLOG_POSTHOG_READ_LOGS: "true",
        CLOG_GITHUB_READ: "true",
        CLOG_GITHUB_PR: "true",
        CLOG_GITHUB_PUSH: "true",
        NOTION_SECRET: "ntn_test",
        CLOG_NOTION_READ_TODO: "true",
        CLOG_VERCEL_DEPLOY: "true",
        CLOG_SHELL_EXECUTE: "true",
      });

      expect(env.capabilities.posthog.canReadInsights).toBe(true);
      expect(env.capabilities.posthog.canReadErrors).toBe(true);
      expect(env.capabilities.posthog.canReadLogs).toBe(false);
      expect(env.capabilities.github.canReadRepository).toBe(false);
      expect(env.capabilities.github.canCreatePullRequest).toBe(false);
      expect(env.capabilities.github.canPushBranch).toBe(false);
      expect(env.capabilities.vercel.canTriggerDeploy).toBe(false);
      expect(env.capabilities.notion.canReadTodo).toBe(false);
      expect(env.capabilities.shell.canExecute).toBe(false);
      expect(env.availableTools.map((tool) => tool.name)).toEqual([
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
      ]);
      expect(env.capabilities.shell.safeRoots).toEqual([
        env.storage.workspaceDir,
        env.storage.storageDir,
      ]);
    } finally {
      process.chdir(previousCwd);
    }
  });
});
