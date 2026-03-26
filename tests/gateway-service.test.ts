import { describe, expect, test } from "bun:test";
import type { AgentEnvironment } from "../apps/clog/src/config";
import { AgentGateway } from "../apps/clog/src/gateway/service";
import type { MonitoringTickResult } from "../apps/clog/src/monitoring/monitor-loop";
import { InMemoryRuntimeStore } from "../apps/clog/src/storage/in-memory-runtime-store";
import type { BrainService } from "../apps/clog/src/brain/service";
import type { PostHogIntegrationClient } from "../apps/clog/src/integrations/posthog/client";
import type { PostHogToolServices } from "../apps/clog/src/tools/types";
import type { MonitoringLoop } from "../apps/clog/src/monitoring/monitor-loop";

const createEnvironment = (): AgentEnvironment => ({
  appName: "clog",
  port: 6900,
  executionMode: "propose",
  monitorIntervalMs: 5_000,
  channels: ["telegram"],
  posthog: {
    host: "https://us.posthog.com",
    workspaceDir: "/tmp/workspace",
    projectId: "123",
    personalApiKey: "phx_test",
    projectApiKey: "phc_test",
    featureFlagsSecureApiKey: null,
    endpointsDir: "/tmp/endpoints",
    cliBin: "posthog-cli",
    cliTimeoutMs: 30_000,
    requestTimeoutMs: 100_000,
    enableLogs: false,
    enableFlags: false,
    enableExperiments: false,
    errorLookbackMinutes: 30,
    errorSpikeThreshold: 10,
    errorSpikeMultiplier: 2,
    criticalErrorThreshold: 25,
    insightMonitors: [],
  },
  ai: {
    provider: "openrouter",
    apiKey: "sk-or-test",
    model: "test-model",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  telegram: {
    botToken: "telegram-token",
    userName: "clog4everbot",
    allowedChatIds: [],
  },
  notion: {
    token: "ntn_test",
    requestTimeoutMs: 30_000,
    todoPageUrl: null,
    todoDataSourceId: null,
    todoSearchTitle: "Pre Beta To Do",
  },
  storage: {
    instanceId: "test-instance",
    instanceRoot: "/tmp/instance",
    readOnlyDir: "/tmp/instance/read-only",
    workspaceDir: "/tmp/instance/workspace",
    storageDir: "/tmp/instance/storage",
    stateDir: "/tmp/instance/storage/state",
  },
  capabilities: {
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
      canReadRepository: false,
      canCreatePullRequest: false,
      canPushBranch: false,
    },
    vercel: {
      canTriggerDeploy: false,
    },
    chat: {
      canSendOperatorMessages: true,
      supportedChannels: ["telegram"],
    },
    notion: {
      canReadTodo: true,
    },
    shell: {
      canExecute: false,
      safeCommands: [],
      safeRoots: [],
    },
  },
  availableTools: [],
});

const createCliResponse = (command: string) => ({
  ok: true,
  command,
  args: [],
  stdout: "",
  stderr: "",
  exitCode: 0,
  durationMs: 0,
  workingDirectory: "/tmp/workspace",
});

const createPostHogServices = (): PostHogToolServices => ({
  getOrganizations: async () => [],
  getProjects: async () => ({ organizationId: "org_1", projects: [] }),
  listMcpTools: async () => ({ total: 0, returned: 0, tools: [] }),
  callMcpTool: async (toolName: string, arguments_?: Record<string, unknown>) => ({
    toolName,
    text: JSON.stringify(arguments_ ?? {}),
    structuredContent: undefined,
  }),
  runQuery: async (name: string) => ({ name, columns: [], results: [] }),
  listErrors: async () => [],
  queryInsight: async (name: string) => ({ name, columns: [], results: [] }),
  listEndpoints: () => createCliResponse("list"),
  diffEndpoints: () => createCliResponse("diff"),
  runEndpoint: () => createCliResponse("run"),
});

describe("AgentGateway", () => {
  test("waits for an in-flight reply before running another monitor cycle", async () => {
    const store = new InMemoryRuntimeStore();
    store.setStatus("idle");

    const replyPromise = Promise.withResolvers<string>();
    const brain = {
      reply: async () => await replyPromise.promise,
    } as unknown as BrainService;

    let monitorStarted = false;
    const monitorLoop = {
      tick: async (): Promise<MonitoringTickResult> => {
        monitorStarted = true;
        return {
          integrationHealth: [],
          findings: [],
          checkedAt: Date.now(),
        };
      },
    } as MonitoringLoop;

    const gateway = new AgentGateway({
      env: createEnvironment(),
      bootedAt: 1,
      brain,
      monitorLoop,
      posthog: {} as PostHogIntegrationClient,
      posthogServices: createPostHogServices(),
      notionServices: {
        getTodoList: async () => ({
          summary: {
            title: "Pre Beta To Do",
            dataSourceId: "todo_1",
            generatedAt: 1,
            total: 1,
            openCount: 1,
            statusCounts: [{ progress: "Not started", count: 1 }],
          },
          items: [],
          printout: "todo",
        }),
      },
      store,
    });

    const sendPromise = gateway.sendMessage({
      channel: "telegram",
      message: "how is the app doing?",
    });

    await Promise.resolve();

    const monitorPromise = gateway.runMonitorCycle();

    await Promise.resolve();
    expect(monitorStarted).toBe(false);

    replyPromise.resolve("All clear.");
    const sendResult = await sendPromise;
    expect(sendResult.replyMessage.content).toBe("All clear.");

    await monitorPromise;
    expect(monitorStarted).toBe(true);
  });
});
