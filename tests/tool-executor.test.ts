import { describe, expect, test } from "bun:test";
import type { IntegrationCapabilitySnapshot, RuntimeObservation } from "@clog/types";
import { ToolExecutor } from "../apps/clog/src/execution/tool-executor";
import type { RuntimeToolServices } from "../apps/clog/src/tools/types";

const createCapabilities = (): IntegrationCapabilitySnapshot => ({
  posthog: {
    canReadInsights: true,
    canReadErrors: true,
    canReadLogs: false,
    canReadFlags: false,
    canReadExperiments: false,
    canManageEndpoints: true,
    canUploadSourcemaps: false,
  },
  github: {
    canReadRepository: false,
    canCreatePullRequest: false,
    canPushBranch: false,
  },
  vercel: {
    canTriggerDeploy: false,
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
    safeCommands: ["ls", "rg"],
    safeRoots: ["/workspace"],
  },
});

const sampleObservation: RuntimeObservation = {
  id: "obs_1",
  kind: "error-rate-spike",
  source: { kind: "posthog", label: "PostHog" },
  summary: "Spike detected",
  details: "Error volume increased",
  severity: "critical",
  detectedAt: 1,
};

const createRuntimeServices = (): RuntimeToolServices => ({
  getStateSnapshot: () => ({
    generatedAt: 1,
    status: "idle",
    openFindingsCount: 1,
    openFindings: [{
      id: "finding_1",
      title: "Checkout issue",
      severity: "warning",
      summary: "Checkout is unstable",
      lastSeenAt: 1,
    }],
    recentThreads: [],
    recentMemories: [],
    recentActionResults: [],
  }),
  getRecentLogs: () => ({
    generatedAt: 1,
    files: [{
      fileName: "latest.log",
      relativePath: "logs/latest.log",
      totalLines: 10,
      returnedLines: 5,
      truncated: true,
      content: "recent log line",
    }],
  }),
  getMonitoringSnapshot: () => ({
    generatedAt: 1,
    latestPerformanceReport: null,
    recentPerformanceReports: [],
    recentPostHogOperations: [],
  }),
  listActions: () => ({
    generatedAt: 1,
    actions: [{
      id: "posthog.dashboard_snapshot",
      title: "PostHog Dashboard Snapshot",
      description: "Get the high-signal product and performance snapshot.",
      summary: "Best first look.",
      tags: ["posthog"],
      available: true,
      toolName: "posthog_get_dashboard_snapshot",
      inputFields: [],
    }],
  }),
  runAction: async () => ({
    actionId: "posthog.dashboard_snapshot",
    title: "PostHog Dashboard Snapshot",
    ok: true,
    summary: "Action completed.",
    toolName: "posthog_get_dashboard_snapshot",
    output: { summary: { pageviews: 10 } },
  }),
  listRoutines: () => ({
    generatedAt: 1,
    routines: [{
      id: "posthog.incident_triage",
      title: "PostHog Incident Triage",
      description: "Incident routine",
      summary: "Runs health plus errors.",
      tags: ["posthog"],
      available: true,
      actionIds: ["posthog.dashboard_snapshot", "posthog.list_errors"],
      inputFields: [],
    }],
  }),
  runRoutine: async () => ({
    routineId: "posthog.incident_triage",
    title: "PostHog Incident Triage",
    ok: true,
    summary: "Routine completed.",
    steps: [],
  }),
  readKnowledge: () => ({
    availablePaths: ["knowledge/example.md"],
    selectedPath: "knowledge/example.md",
    content: "Knowledge content",
    truncated: false,
  }),
  readJson: () => ({
    path: "workspace/posthog-tool-output.json",
    fieldPath: "operations.dashboardSnapshot",
    valueType: "object",
    childKeys: ["history"],
    childCount: 1,
    value: {
      history: [],
    },
    truncated: false,
  }),
});

describe("ToolExecutor", () => {
  test("executes a typed shell tool and validates the output", async () => {
    const executor = new ToolExecutor({
      capabilities: createCapabilities(),
      services: {
        posthog: null,
        notion: {
          getTodoList: async () => ({
            summary: {
              title: "Pre Beta To Do",
              dataSourceId: "todo_1",
              generatedAt: 1,
              total: 3,
              openCount: 2,
              statusCounts: [{ progress: "In progress", count: 2 }],
            },
            items: [],
            printout: "Pre Beta To Do",
          }),
        },
        runtime: createRuntimeServices(),
        shell: {
          safeRoots: ["/workspace"],
          execute: (input) => ({
            ok: true,
            command: input.command,
            args: input.args ?? [],
            stdout: "done",
            stderr: "",
            exitCode: 0,
            durationMs: 12,
            workingDirectory: input.cwd ?? "/workspace",
          }),
        },
        github: null,
        vercel: null,
      },
    });

    const result = await executor.execute("shell_execute_command", {
      command: "ls",
      args: ["-la"],
      cwd: "/workspace",
    });

    expect(result.ok).toBe(true);
    expect(result.tool.name).toBe("shell_execute_command");
    expect(result.content).toContain("\"stdout\": \"done\"");
  });

  test("returns a typed disabled error when a tool is not available", async () => {
    const capabilities: IntegrationCapabilitySnapshot = {
      ...createCapabilities(),
      shell: {
        ...createCapabilities().shell,
      canExecute: false,
      },
    };

    const executor = new ToolExecutor({
      capabilities,
      services: {
        posthog: null,
        notion: null,
        runtime: createRuntimeServices(),
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const result = await executor.execute("shell_execute_command", {
      command: "ls",
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("tool_disabled");
  });

  test("parses provider tool calls and executes posthog tools", async () => {
    const executor = new ToolExecutor({
      capabilities: createCapabilities(),
      services: {
        posthog: {
          getOrganizations: async () => [
            {
              id: "org_1",
              name: "Org",
              slug: "org",
              membershipLevel: null,
            },
          ],
          getProjects: async () => ({
            organizationId: "org_1",
            projects: [],
          }),
          listMcpTools: async () => ({
            total: 1,
            returned: 1,
            tools: [{ name: "query-run", title: "Query Run", description: "Run a query" }],
          }),
          callMcpTool: async (toolName) => ({
            toolName,
            text: "mcp ok",
          }),
          runQuery: async (name, query) => ({
            name,
            columns: ["query"],
            results: [{ query }],
          }),
          listErrors: async () => [sampleObservation],
          getDocumentedToolCatalog: async () => ({
            verifiedAt: "2026-04-01",
            sources: ["https://posthog.com/docs/model-context-protocol"],
            serverUrls: {
              us: "https://mcp.posthog.com/mcp",
              eu: "https://mcp-eu.posthog.com/mcp",
            },
            pinning: {
              supportedHeaders: ["x-posthog-project-id"],
              supportedQueryParameters: ["project_id"],
            },
            featureFilterExample: "https://mcp.posthog.com/mcp?features=flags,insights",
            apiPrimitives: [],
            recommendedBuildOrder: [],
            features: [{
              feature: "insights",
              title: "Insights",
              description: "Analytics tools",
              docsUrl: "https://posthog.com/docs/model-context-protocol",
              priority: "core",
              tools: [{ name: "query-run", purpose: "Run a query" }],
            }],
          }),
          getDashboardSnapshot: async () => ({
            generatedAt: 1,
            windowMinutes: 15,
            summary: {
              pageviews: 10,
              uniqueVisitors: 5,
              webVitalsEvents: 4,
              exceptionEvents: 1,
              distinctExceptionIssues: 1,
              webVitalsCoverageRatio: 0.4,
              errorRatePer1kPageviews: 100,
              slowLcpPages: 0,
              slowInpPages: 0,
              productionReadinessScore: 92,
              anomalyCount: 0,
            },
            previousWindow: {
              pageviews: 12,
              webVitalsEvents: 5,
              exceptionEvents: 0,
              pageviewsDeltaPercent: -16.7,
              webVitalsDeltaPercent: -20,
              exceptionDeltaPercent: null,
            },
            topPaths: [],
            lcp: [],
            inp: [],
            anomalies: [],
          }),
          queryInsight: async (name, query) => ({
            name,
            columns: ["query"],
            results: [{ query }],
          }),
          listEndpoints: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["list"],
            stdout: "list ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
          diffEndpoints: (path) => ({
            ok: true,
            command: "posthog-cli",
            args: ["diff", path],
            stdout: "diff ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
          runEndpoint: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["run"],
            stdout: "run ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
        },
        notion: {
          getTodoList: async () => ({
            summary: {
              title: "Pre Beta To Do",
              dataSourceId: "todo_1",
              generatedAt: 1,
              total: 3,
              openCount: 2,
              statusCounts: [{ progress: "In progress", count: 2 }],
            },
            items: [],
            printout: "Pre Beta To Do",
          }),
        },
        runtime: createRuntimeServices(),
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const result = await executor.executeProviderToolCall({
      id: "call_1",
      type: "function",
      function: {
        name: "posthog_run_query",
        arguments: JSON.stringify({
          name: "Revenue monitor",
          query: "SELECT 1",
        }),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.content).toContain("Revenue monitor");
  });

  test("executes the PostHog error tool and returns observations", async () => {
    const executor = new ToolExecutor({
      capabilities: createCapabilities(),
      services: {
        posthog: {
          getOrganizations: async () => [],
          getProjects: async () => ({
            organizationId: "org_1",
            projects: [],
          }),
          listMcpTools: async () => ({
            total: 1,
            returned: 1,
            tools: [{ name: "query-run", title: "Query Run", description: "Run a query" }],
          }),
          callMcpTool: async (toolName) => ({
            toolName,
            text: "mcp ok",
          }),
          runQuery: async (name) => ({
            name,
            columns: [],
            results: [],
          }),
          listErrors: async () => [sampleObservation],
          getDocumentedToolCatalog: async () => ({
            verifiedAt: "2026-04-01",
            sources: ["https://posthog.com/docs/model-context-protocol"],
            serverUrls: {
              us: "https://mcp.posthog.com/mcp",
              eu: "https://mcp-eu.posthog.com/mcp",
            },
            pinning: {
              supportedHeaders: ["x-posthog-project-id"],
              supportedQueryParameters: ["project_id"],
            },
            featureFilterExample: "https://mcp.posthog.com/mcp?features=flags,insights",
            apiPrimitives: [],
            recommendedBuildOrder: [],
            features: [],
          }),
          getDashboardSnapshot: async () => ({
            generatedAt: 1,
            windowMinutes: 15,
            summary: {
              pageviews: 10,
              uniqueVisitors: 5,
              webVitalsEvents: 4,
              exceptionEvents: 1,
              distinctExceptionIssues: 1,
              webVitalsCoverageRatio: 0.4,
              errorRatePer1kPageviews: 100,
              slowLcpPages: 0,
              slowInpPages: 0,
              productionReadinessScore: 92,
              anomalyCount: 0,
            },
            previousWindow: {
              pageviews: 12,
              webVitalsEvents: 5,
              exceptionEvents: 0,
              pageviewsDeltaPercent: -16.7,
              webVitalsDeltaPercent: -20,
              exceptionDeltaPercent: null,
            },
            topPaths: [],
            lcp: [],
            inp: [],
            anomalies: [],
          }),
          queryInsight: async (name) => ({
            name,
            columns: [],
            results: [],
          }),
          listEndpoints: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["list"],
            stdout: "list ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
          diffEndpoints: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["diff"],
            stdout: "diff ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
          runEndpoint: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["run"],
            stdout: "run ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
        },
        notion: {
          getTodoList: async () => ({
            summary: {
              title: "Pre Beta To Do",
              dataSourceId: "todo_1",
              generatedAt: 1,
              total: 1,
              openCount: 1,
              statusCounts: [{ progress: "Not started", count: 1 }],
            },
            items: [{
              id: "task_1",
              name: "Finish onboarding",
              progress: "Not started",
              dueDate: null,
              assignees: [],
              taskTypes: [],
              url: "https://www.notion.so/task_1",
            }],
            printout: "Finish onboarding",
          }),
        },
        runtime: createRuntimeServices(),
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const result = await executor.execute("posthog_list_errors", {});

    expect(result.ok).toBe(true);
    expect(result.content).toContain("Spike detected");
  });

  test("executes the Notion todo tool and returns a printout", async () => {
    const executor = new ToolExecutor({
      capabilities: createCapabilities(),
      services: {
        posthog: null,
        notion: {
          getTodoList: async () => ({
            summary: {
              title: "Pre Beta To Do",
              dataSourceId: "todo_1",
              generatedAt: 1,
              total: 2,
              openCount: 1,
              statusCounts: [{ progress: "In progress", count: 1 }],
            },
            items: [{
              id: "task_1",
              name: "Finish onboarding",
              progress: "In progress",
              dueDate: null,
              assignees: [],
              taskTypes: [],
              url: "https://www.notion.so/task_1",
            }],
            printout: "Finish onboarding",
          }),
        },
        runtime: createRuntimeServices(),
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const result = await executor.execute("notion_get_todo_list", {});

    expect(result.ok).toBe(true);
    expect(result.content).toContain("Finish onboarding");
  });

  test("executes the runtime state snapshot tool", async () => {
    const executor = new ToolExecutor({
      capabilities: createCapabilities(),
      services: {
        posthog: null,
        notion: null,
        runtime: createRuntimeServices(),
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const result = await executor.execute("runtime_get_state_snapshot", {});

    expect(result.ok).toBe(true);
    expect(result.content).toContain("Checkout issue");
  });

  test("executes the runtime recent logs tool", async () => {
    const executor = new ToolExecutor({
      capabilities: createCapabilities(),
      services: {
        posthog: null,
        notion: null,
        runtime: createRuntimeServices(),
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const result = await executor.execute("runtime_get_recent_logs", {});

    expect(result.ok).toBe(true);
    expect(result.content).toContain("latest.log");
    expect(result.content).toContain("recent log line");
  });

  test("executes the runtime action runner tool", async () => {
    const executor = new ToolExecutor({
      capabilities: createCapabilities(),
      services: {
        posthog: null,
        notion: null,
        runtime: createRuntimeServices(),
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const result = await executor.execute("runtime_run_action", {
      actionId: "posthog.dashboard_snapshot",
    });

    expect(result.ok).toBe(true);
    expect(result.content).toContain("posthog.dashboard_snapshot");
  });

  test("executes the runtime routine runner tool", async () => {
    const executor = new ToolExecutor({
      capabilities: createCapabilities(),
      services: {
        posthog: null,
        notion: null,
        runtime: createRuntimeServices(),
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const result = await executor.execute("runtime_run_routine", {
      routineId: "posthog.incident_triage",
    });

    expect(result.ok).toBe(true);
    expect(result.content).toContain("posthog.incident_triage");
  });

  test("executes the runtime knowledge reader tool", async () => {
    const executor = new ToolExecutor({
      capabilities: createCapabilities(),
      services: {
        posthog: null,
        notion: null,
        runtime: createRuntimeServices(),
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const result = await executor.execute("runtime_read_knowledge", {
      path: "knowledge/example.md",
    });

    expect(result.ok).toBe(true);
    expect(result.content).toContain("Knowledge content");
  });

  test("executes the runtime json reader tool", async () => {
    const executor = new ToolExecutor({
      capabilities: createCapabilities(),
      services: {
        posthog: null,
        notion: null,
        runtime: createRuntimeServices(),
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const result = await executor.execute("runtime_read_json", {
      path: "workspace/posthog-tool-output.json",
      fieldPath: "operations.dashboardSnapshot",
    });

    expect(result.ok).toBe(true);
    expect(result.content).toContain("workspace/posthog-tool-output.json");
    expect(result.content).toContain("\"fieldPath\": \"operations.dashboardSnapshot\"");
    expect(result.content).toContain("\"value\": {");
    expect(result.content).toContain("\"history\": []");
  });

  test("executes the generic PostHog MCP catalog tool", async () => {
    const executor = new ToolExecutor({
      capabilities: createCapabilities(),
      services: {
        posthog: {
          getOrganizations: async () => [],
          getProjects: async () => ({
            organizationId: "org_1",
            projects: [],
          }),
          listMcpTools: async () => ({
            total: 2,
            returned: 1,
            tools: [{ name: "query-run", title: "Query Run", description: "Run a query" }],
          }),
          callMcpTool: async (toolName) => ({
            toolName,
            text: "mcp ok",
          }),
          runQuery: async (name) => ({
            name,
            columns: [],
            results: [],
          }),
          listErrors: async () => [],
          getDocumentedToolCatalog: async () => ({
            verifiedAt: "2026-04-01",
            sources: ["https://posthog.com/docs/model-context-protocol"],
            serverUrls: {
              us: "https://mcp.posthog.com/mcp",
              eu: "https://mcp-eu.posthog.com/mcp",
            },
            pinning: {
              supportedHeaders: ["x-posthog-project-id"],
              supportedQueryParameters: ["project_id"],
            },
            featureFilterExample: "https://mcp.posthog.com/mcp?features=flags,insights",
            apiPrimitives: [],
            recommendedBuildOrder: [],
            features: [],
          }),
          getDashboardSnapshot: async () => ({
            generatedAt: 1,
            windowMinutes: 15,
            summary: {
              pageviews: 10,
              uniqueVisitors: 5,
              webVitalsEvents: 4,
              exceptionEvents: 0,
              distinctExceptionIssues: 0,
              webVitalsCoverageRatio: 0.4,
              errorRatePer1kPageviews: 0,
              slowLcpPages: 0,
              slowInpPages: 0,
              productionReadinessScore: 100,
              anomalyCount: 0,
            },
            previousWindow: {
              pageviews: 12,
              webVitalsEvents: 5,
              exceptionEvents: 0,
              pageviewsDeltaPercent: -16.7,
              webVitalsDeltaPercent: -20,
              exceptionDeltaPercent: null,
            },
            topPaths: [],
            lcp: [],
            inp: [],
            anomalies: [],
          }),
          queryInsight: async (name) => ({
            name,
            columns: [],
            results: [],
          }),
          listEndpoints: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["list"],
            stdout: "list ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
          diffEndpoints: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["diff"],
            stdout: "diff ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
          runEndpoint: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["run"],
            stdout: "run ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
        },
        notion: {
          getTodoList: async () => ({
            summary: {
              title: "Pre Beta To Do",
              dataSourceId: "todo_1",
              generatedAt: 1,
              total: 2,
              openCount: 1,
              statusCounts: [{ progress: "In progress", count: 1 }],
            },
            items: [],
            printout: "ok",
          }),
        },
        runtime: createRuntimeServices(),
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const result = await executor.execute("posthog_list_mcp_tools", {
      nameFilter: "query",
    });

    expect(result.ok).toBe(true);
    expect(result.content).toContain("query-run");
  });

  test("executes a first-class PostHog SQL wrapper tool", async () => {
    const executor = new ToolExecutor({
      capabilities: createCapabilities(),
      services: {
        posthog: {
          getOrganizations: async () => [],
          getProjects: async () => ({
            organizationId: "org_1",
            projects: [],
          }),
          listMcpTools: async () => ({
            total: 0,
            returned: 0,
            tools: [],
          }),
          callMcpTool: async (toolName, args) => ({
            toolName,
            text: "sql ok",
            structuredContent: { toolName, args },
          }),
          runQuery: async (name) => ({
            name,
            columns: [],
            results: [],
          }),
          listErrors: async () => [],
          getDocumentedToolCatalog: async () => ({
            verifiedAt: "2026-04-01",
            sources: ["https://posthog.com/docs/model-context-protocol"],
            serverUrls: {
              us: "https://mcp.posthog.com/mcp",
              eu: "https://mcp-eu.posthog.com/mcp",
            },
            pinning: {
              supportedHeaders: ["x-posthog-project-id"],
              supportedQueryParameters: ["project_id"],
            },
            featureFilterExample: "https://mcp.posthog.com/mcp?features=flags,insights",
            apiPrimitives: [],
            recommendedBuildOrder: [],
            features: [],
          }),
          getDashboardSnapshot: async () => ({
            generatedAt: 1,
            windowMinutes: 15,
            summary: {
              pageviews: 10,
              uniqueVisitors: 5,
              webVitalsEvents: 4,
              exceptionEvents: 0,
              distinctExceptionIssues: 0,
              webVitalsCoverageRatio: 0.4,
              errorRatePer1kPageviews: 0,
              slowLcpPages: 0,
              slowInpPages: 0,
              productionReadinessScore: 100,
              anomalyCount: 0,
            },
            previousWindow: {
              pageviews: 12,
              webVitalsEvents: 5,
              exceptionEvents: 0,
              pageviewsDeltaPercent: -16.7,
              webVitalsDeltaPercent: -20,
              exceptionDeltaPercent: null,
            },
            topPaths: [],
            lcp: [],
            inp: [],
            anomalies: [],
          }),
          queryInsight: async (name) => ({
            name,
            columns: [],
            results: [],
          }),
          listEndpoints: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["list"],
            stdout: "list ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
          diffEndpoints: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["diff"],
            stdout: "diff ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
          runEndpoint: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["run"],
            stdout: "run ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
        },
        notion: null,
        runtime: createRuntimeServices(),
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const result = await executor.execute("posthog_execute_sql", {
      query: "select 1",
    });

    expect(result.ok).toBe(true);
    expect(result.content).toContain("\"toolName\": \"execute-sql\"");
    expect(result.content).toContain("\"query\": \"select 1\"");
  });

  test("executes a generic PostHog MCP tool call", async () => {
    const executor = new ToolExecutor({
      capabilities: createCapabilities(),
      services: {
        posthog: {
          getOrganizations: async () => [],
          getProjects: async () => ({
            organizationId: "org_1",
            projects: [],
          }),
          listMcpTools: async () => ({
            total: 1,
            returned: 1,
            tools: [{ name: "query-run", title: "Query Run", description: "Run a query" }],
          }),
          callMcpTool: async (toolName, args) => ({
            toolName,
            text: JSON.stringify(args ?? {}),
            structuredContent: { ok: true },
          }),
          runQuery: async (name) => ({
            name,
            columns: [],
            results: [],
          }),
          listErrors: async () => [],
          getDocumentedToolCatalog: async () => ({
            verifiedAt: "2026-04-01",
            sources: ["https://posthog.com/docs/model-context-protocol"],
            serverUrls: {
              us: "https://mcp.posthog.com/mcp",
              eu: "https://mcp-eu.posthog.com/mcp",
            },
            pinning: {
              supportedHeaders: ["x-posthog-project-id"],
              supportedQueryParameters: ["project_id"],
            },
            featureFilterExample: "https://mcp.posthog.com/mcp?features=flags,insights",
            apiPrimitives: [],
            recommendedBuildOrder: [],
            features: [],
          }),
          getDashboardSnapshot: async () => ({
            generatedAt: 1,
            windowMinutes: 15,
            summary: {
              pageviews: 10,
              uniqueVisitors: 5,
              webVitalsEvents: 4,
              exceptionEvents: 0,
              distinctExceptionIssues: 0,
              webVitalsCoverageRatio: 0.4,
              errorRatePer1kPageviews: 0,
              slowLcpPages: 0,
              slowInpPages: 0,
              productionReadinessScore: 100,
              anomalyCount: 0,
            },
            previousWindow: {
              pageviews: 12,
              webVitalsEvents: 5,
              exceptionEvents: 0,
              pageviewsDeltaPercent: -16.7,
              webVitalsDeltaPercent: -20,
              exceptionDeltaPercent: null,
            },
            topPaths: [],
            lcp: [],
            inp: [],
            anomalies: [],
          }),
          queryInsight: async (name) => ({
            name,
            columns: [],
            results: [],
          }),
          listEndpoints: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["list"],
            stdout: "list ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
          diffEndpoints: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["diff"],
            stdout: "diff ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
          runEndpoint: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["run"],
            stdout: "run ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
        },
        notion: {
          getTodoList: async () => ({
            summary: {
              title: "Pre Beta To Do",
              dataSourceId: "todo_1",
              generatedAt: 1,
              total: 2,
              openCount: 1,
              statusCounts: [{ progress: "In progress", count: 1 }],
            },
            items: [],
            printout: "ok",
          }),
        },
        runtime: createRuntimeServices(),
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const result = await executor.execute("posthog_call_mcp_tool", {
      toolName: "query-run",
      arguments: {
        limit: 1,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.content).toContain("\"toolName\": \"query-run\"");
  });

  test("executes the PostHog endpoint list tool", async () => {
    const executor = new ToolExecutor({
      capabilities: createCapabilities(),
      services: {
        posthog: {
          getOrganizations: async () => [],
          getProjects: async () => ({
            organizationId: "org_1",
            projects: [],
          }),
          listMcpTools: async () => ({
            total: 1,
            returned: 1,
            tools: [{ name: "query-run", title: "Query Run", description: "Run a query" }],
          }),
          callMcpTool: async (toolName) => ({
            toolName,
            text: "mcp ok",
          }),
          runQuery: async (name) => ({
            name,
            columns: [],
            results: [],
          }),
          listErrors: async () => [],
          getDocumentedToolCatalog: async () => ({
            verifiedAt: "2026-04-01",
            sources: ["https://posthog.com/docs/model-context-protocol"],
            serverUrls: {
              us: "https://mcp.posthog.com/mcp",
              eu: "https://mcp-eu.posthog.com/mcp",
            },
            pinning: {
              supportedHeaders: ["x-posthog-project-id"],
              supportedQueryParameters: ["project_id"],
            },
            featureFilterExample: "https://mcp.posthog.com/mcp?features=flags,insights",
            apiPrimitives: [],
            recommendedBuildOrder: [],
            features: [],
          }),
          getDashboardSnapshot: async () => ({
            generatedAt: 1,
            windowMinutes: 15,
            summary: {
              pageviews: 10,
              uniqueVisitors: 5,
              webVitalsEvents: 4,
              exceptionEvents: 0,
              distinctExceptionIssues: 0,
              webVitalsCoverageRatio: 0.4,
              errorRatePer1kPageviews: 0,
              slowLcpPages: 0,
              slowInpPages: 0,
              productionReadinessScore: 100,
              anomalyCount: 0,
            },
            previousWindow: {
              pageviews: 12,
              webVitalsEvents: 5,
              exceptionEvents: 0,
              pageviewsDeltaPercent: -16.7,
              webVitalsDeltaPercent: -20,
              exceptionDeltaPercent: null,
            },
            topPaths: [],
            lcp: [],
            inp: [],
            anomalies: [],
          }),
          queryInsight: async (name) => ({
            name,
            columns: [],
            results: [],
          }),
          listEndpoints: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["list"],
            stdout: "endpoint-a\nendpoint-b",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
          diffEndpoints: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["diff"],
            stdout: "diff ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
          runEndpoint: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["run"],
            stdout: "run ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
        },
        notion: {
          getTodoList: async () => ({
            summary: {
              title: "Pre Beta To Do",
              dataSourceId: "todo_1",
              generatedAt: 1,
              total: 2,
              openCount: 1,
              statusCounts: [{ progress: "In progress", count: 1 }],
            },
            items: [],
            printout: "ok",
          }),
        },
        runtime: createRuntimeServices(),
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const result = await executor.execute("posthog_list_endpoints", {});

    expect(result.ok).toBe(true);
    expect(result.content).toContain("endpoint-a");
  });
});
