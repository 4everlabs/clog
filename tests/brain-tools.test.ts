import { describe, expect, test } from "bun:test";
import type { AgentFinding, ConversationThread, IntegrationCapabilitySnapshot } from "@clog/types";
import { BrainService } from "../apps/clog/src/ai/brain/service";
import { ToolExecutor } from "../apps/clog/src/ai/tools/tool-executor";
import type { PostHogDocumentedFeatureCatalog, PostHogDocumentedToolCatalog } from "../apps/clog/src/ai/integrations/posthog/documented-tool-catalog";
import { buildProviderTools, summarizeAdvertisedTools } from "../apps/clog/src/ai/tools/registry";
import type { RuntimeToolServices } from "../apps/clog/src/ai/tools/types";

const createCapabilities = (): IntegrationCapabilitySnapshot => ({
  posthog: {
    canReadInsights: true,
    canReadErrors: false,
    canReadLogs: false,
    canReadFlags: false,
    canReadExperiments: false,
    canManageEndpoints: false,
    canUploadSourcemaps: false,
  },
  convex: {
    canReadData: false,
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
    canReadTodo: false,
  },
  shell: {
    canExecute: false,
    safeCommands: ["ls"],
    safeRoots: ["/workspace"],
  },
});

const createThread = (message: string): ConversationThread => ({
  id: "thread_1",
  title: "Tool Thread",
  channel: "tui",
  createdAt: 1,
  updatedAt: 2,
  messages: [
    {
      id: "msg_1",
      role: "user",
      channel: "tui",
      content: message,
      createdAt: 2,
    },
  ],
});

const createFinding = (): AgentFinding => ({
  id: "finding_1",
  title: "Checkout errors are spiking",
  severity: "critical",
  state: "open",
  summary: "Checkout exceptions increased sharply.",
  details: "The checkout flow is throwing more exceptions than baseline.",
  firstSeenAt: 1,
  lastSeenAt: 2,
  sources: [{ kind: "posthog", label: "PostHog" }],
  observations: [],
  proposedActions: [],
});

const createDocumentedCatalog = (
  features: readonly PostHogDocumentedFeatureCatalog[] = [],
): PostHogDocumentedToolCatalog => ({
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
  categories: [],
  liveCatalog: {
    totalTools: 0,
    accessibleToolNames: [],
    missingDocumentedToolNames: [],
  },
  features,
});

const createRuntimeServices = (): RuntimeToolServices => ({
  getStateSnapshot: () => ({
    generatedAt: 1,
    status: "idle",
    openFindingsCount: 1,
    openFindings: [],
    recentThreads: [],
    recentMemories: [],
    recentActionResults: [],
  }),
  getRecentLogs: () => ({
    generatedAt: 1,
    files: [],
  }),
  getMonitoringSnapshot: () => ({
    generatedAt: 1,
    latestPerformanceReport: null,
    recentPerformanceReports: [],
    recentPostHogOperations: [],
  }),
  listActions: () => ({
    generatedAt: 1,
    actions: [],
  }),
  runAction: async () => ({
    actionId: "posthog.dashboard_snapshot",
    title: "PostHog Dashboard Snapshot",
    ok: true,
    summary: "Action completed.",
    toolName: "posthog_get_dashboard_snapshot",
    output: {},
  }),
  listRoutines: () => ({
    generatedAt: 1,
    routines: [],
  }),
  runRoutine: async () => ({
    routineId: "posthog.incident_triage",
    title: "PostHog Incident Triage",
    ok: true,
    summary: "Routine completed.",
    steps: [],
  }),
  readKnowledge: () => ({
    availablePaths: ["workspace/project/about.md"],
    selectedPath: null,
    content: null,
    truncated: false,
  }),
  readJson: () => ({
    path: "workspace/posthog-tool-output.json",
    fieldPath: null,
    valueType: "object",
    childKeys: ["operations"],
    childCount: 1,
    value: { operations: {} },
    truncated: false,
  }),
  writeWorkspaceFile: () => ({
    path: "workspace/project/notes.md",
    created: true,
    bytesWritten: 24,
  }),
  listConversations: () => ({
    generatedAt: 1,
    conversations: [],
  }),
  getConversation: () => ({
    generatedAt: 1,
    thread: {
      id: "thread_stub",
      title: "Stub",
      channel: "tui",
      createdAt: 1,
      updatedAt: 1,
    },
    messages: [],
    totalMessages: 0,
    messageOffset: 0,
    messageLimit: 100,
    tokenBudget: 3000,
    returnedTokenEstimate: 0,
    hasMoreMessages: false,
    nextMessageOffset: null,
    remainingMessages: 0,
    nextRequest: null,
    continuationHint: null,
  }),
  searchMessages: () => ({
    generatedAt: 1,
    matches: [],
    truncated: false,
  }),
});

describe("BrainService tool loop", () => {
  test("executes native tools and returns the final assistant text", async () => {
    const capabilities = createCapabilities();
    const requests: Array<Record<string, unknown>> = [];
    const toolExecutor = new ToolExecutor({
      capabilities,
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
          listErrors: async () => [],
          getDocumentedToolCatalog: async () => createDocumentedCatalog(),
          getDashboardSnapshot: async () => ({
            generatedAt: 1,
            windowMinutes: 60,
            windowStartAt: 0,
            windowEndAt: 1,
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
              slowFcpPages: 0,
              slowClsPages: 0,
              productionReadinessScore: 100,
              anomalyCount: 0,
            },
            previousWindow: {
              pageviews: 12,
              uniqueVisitors: 6,
              webVitalsEvents: 5,
              exceptionEvents: 0,
              distinctExceptionIssues: 0,
              pageviewsDeltaPercent: -16.7,
              uniqueVisitorsDeltaPercent: -16.7,
              webVitalsDeltaPercent: -20,
              exceptionDeltaPercent: null,
              distinctExceptionIssuesDeltaPercent: null,
            },
            topPaths: [],
            lcp: [],
            inp: [],
            fcp: [],
            cls: [],
            anomalies: [],
          }),
          queryInsight: async (name, query) => ({
            name,
            columns: ["query"],
            results: [{ query }],
          }),
          listEndpoints: () => {
            throw new Error("not used");
          },
          diffEndpoints: () => {
            throw new Error("not used");
          },
          runEndpoint: () => {
            throw new Error("not used");
          },
        },
        convex: null,
        notion: null,
        runtime: createRuntimeServices(),
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const responses = [
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "posthog_run_query",
                    arguments: JSON.stringify({
                      name: "Revenue monitor",
                      query: "SELECT 1",
                    }),
                  },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: "I checked the insight and the query returned successfully.",
            },
          },
        ],
      },
    ];

    const brain = new BrainService({
      apiKey: "test-key",
      modelName: "test-model",
      baseUrl: "https://api.openai.com/v1",
      executionMode: "propose",
      availableTools: summarizeAdvertisedTools(capabilities),
      providerTools: buildProviderTools(capabilities),
      toolExecutor,
      fetchFn: async (_input, init) => {
        requests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        const body = responses.shift();
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
    });

    const reply = await brain.reply({
      thread: createThread("Check the revenue monitor"),
      message: "Check the revenue monitor",
      findings: [createFinding()],
    });

    expect(reply).toContain("query returned successfully");
    expect(requests).toHaveLength(2);
    const firstRequestTools = (requests[0]?.tools ?? []) as Array<{ function: { name: string } }>;
    expect(firstRequestTools.map((tool) => tool.function.name)).toEqual([
      "posthog_get_documented_tool_catalog",
      "posthog_list_mcp_tools",
      "posthog_call_mcp_tool",
      "posthog_get_dashboard_snapshot",
      "posthog_get_info",
      "posthog_get_health_summary",
      "posthog_get_asset_summary",
      "posthog_get_release_summary",
      "runtime_get_info",
      "runtime_list_conversations",
      "runtime_get_conversation",
      "runtime_search_messages",
      "runtime_read_knowledge",
      "runtime_read_json",
      "runtime_write_workspace_file",
    ]);
    expect(JSON.stringify(requests[1]?.messages)).toContain("posthog_run_query");
    expect(JSON.stringify(requests[1]?.messages)).toContain("Revenue monitor");
  });
});
