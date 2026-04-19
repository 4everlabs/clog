import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AgentEnvironment } from "../apps/clog/src/runtime/config";
import { AgentGateway } from "../apps/clog/src/runtime/gateway/service";
import type { MonitoringTickResult } from "../apps/clog/src/runtime/monitor-loop";
import { InMemoryRuntimeStore } from "../apps/clog/src/storage/in-memory-runtime-store";
import type { BrainService } from "../apps/clog/src/ai/brain/service";
import type { PostHogIntegrationClient } from "../apps/clog/src/ai/integrations/posthog/client";
import type { PostHogDocumentedToolCatalog, PostHogDocumentedFeatureCatalog } from "../apps/clog/src/ai/integrations/posthog/documented-tool-catalog";
import type { PostHogToolServices } from "../apps/clog/src/ai/tools/types";
import type { MonitoringLoop } from "../apps/clog/src/runtime/monitor-loop";

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (path) {
      rmSync(path, { recursive: true, force: true });
    }
  }
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

const createEnvironment = (overrides: Partial<AgentEnvironment> = {}): AgentEnvironment => ({
  appName: "clog",
  port: 6900,
  executionMode: "propose",
  monitorIntervalMs: 5_000,
  runtimeContext: null,
  hidePosthogContextTools: false,
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
  convex: {
    deploymentUrl: null,
    authToken: null,
    requestTimeoutMs: 30_000,
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
  preferences: {
    timezone: "America/Los_Angeles",
  },
  ...overrides,
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
  getDocumentedToolCatalog: async () => createDocumentedCatalog(),
  listErrors: async () => [],
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
  queryInsight: async (name: string) => ({ name, columns: [], results: [] }),
  listEndpoints: () => createCliResponse("list"),
  diffEndpoints: () => createCliResponse("diff"),
  runEndpoint: () => createCliResponse("run"),
});

describe("AgentGateway", () => {
  test("allows a monitor cycle to run while a reply is still in flight", async () => {
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
          observations: [],
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
    expect(monitorStarted).toBe(true);

    replyPromise.resolve("All clear.");
    const sendResult = await sendPromise;
    expect(sendResult.replyMessage.content).toBe("All clear.");

    await monitorPromise;
    expect(monitorStarted).toBe(true);
  });

  test("serializes replies on the same thread", async () => {
    const store = new InMemoryRuntimeStore();
    store.setStatus("idle");
    const thread = store.createThread("telegram", "Operator thread");

    const firstReply = Promise.withResolvers<string>();
    let replyCallCount = 0;
    let secondReplyStarted = false;
    const brain = {
      reply: async () => {
        replyCallCount += 1;
        if (replyCallCount === 1) {
          return await firstReply.promise;
        }
        secondReplyStarted = true;
        return "Second reply";
      },
    } as unknown as BrainService;

    const monitorLoop = {
      tick: async (): Promise<MonitoringTickResult> => ({
        observations: [],
        integrationHealth: [],
        findings: [],
        checkedAt: Date.now(),
      }),
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

    const firstSend = gateway.sendMessage({
      channel: "telegram",
      threadId: thread.id,
      message: "first",
    });

    await Promise.resolve();

    const secondSend = gateway.sendMessage({
      channel: "telegram",
      threadId: thread.id,
      message: "second",
    });

    await Promise.resolve();
    expect(secondReplyStarted).toBe(false);

    firstReply.resolve("First reply");
    const firstResult = await firstSend;
    expect(firstResult.replyMessage.content).toBe("First reply");

    const secondResult = await secondSend;
    expect(secondReplyStarted).toBe(true);
    expect(secondResult.replyMessage.content).toBe("Second reply");
  });

  test("loads and updates the wakeup config from the runtime instance file", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clog-gateway-wakeup-"));
    cleanupPaths.push(workspaceRoot);

    const instanceRoot = join(workspaceRoot, "instance");
    const readOnlyDir = join(instanceRoot, "read-only");
    mkdirSync(readOnlyDir, { recursive: true });
    writeFileSync(join(readOnlyDir, "wakeup.json"), JSON.stringify({
      enabled: true,
      prompts: {
        daily: {
          title: "Daily check",
          prompt: "Initial wakeup prompt",
        },
      },
      schedule: [{
        promptId: "daily",
        timeUtc: "09:00",
      }],
    }, null, 2));

    const store = new InMemoryRuntimeStore();
    store.setStatus("idle");
    const monitorLoop = {
      tick: async (): Promise<MonitoringTickResult> => ({
        observations: [],
        integrationHealth: [],
        findings: [],
        checkedAt: Date.now(),
      }),
    } as MonitoringLoop;

    const gateway = new AgentGateway({
      env: createEnvironment({
        storage: {
          instanceId: "test-instance",
          instanceRoot,
          readOnlyDir,
          workspaceDir: join(instanceRoot, "workspace"),
          storageDir: join(instanceRoot, "storage"),
          stateDir: join(instanceRoot, "storage", "state"),
        },
      }),
      bootedAt: 1,
      brain: {
        reply: async () => "ok",
      } as unknown as BrainService,
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

    const bootstrap = await gateway.bootstrap();
    expect(bootstrap.wakeup).toEqual({
      enabled: true,
      prompts: {
        daily: {
          title: "Daily check",
          prompt: "Initial wakeup prompt",
        },
      },
      schedule: [{
        promptId: "daily",
        timeUtc: "09:00",
      }],
    });

    const updated = await gateway.updateWakeupConfig({
      enabled: true,
      prompts: {
        morning: {
          title: "Morning check",
          prompt: "Updated wakeup prompt",
        },
      },
      schedule: [{
        promptId: "morning",
        timeUtc: "12:00",
      }],
    });

    expect(updated.wakeup).toEqual({
      enabled: true,
      prompts: {
        morning: {
          title: "Morning check",
          prompt: "Updated wakeup prompt",
        },
      },
      schedule: [{
        promptId: "morning",
        timeUtc: "12:00",
      }],
    });
    expect(JSON.parse(readFileSync(join(readOnlyDir, "wakeup.json"), "utf-8"))).toEqual({
      enabled: true,
      prompts: {
        morning: {
          title: "Morning check",
          prompt: "Updated wakeup prompt",
        },
      },
      schedule: [{
        promptId: "morning",
        timeUtc: "12:00",
      }],
    });
  });

  test("allows clearing the wakeup config", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clog-gateway-wakeup-empty-"));
    cleanupPaths.push(workspaceRoot);

    const instanceRoot = join(workspaceRoot, "instance");
    const readOnlyDir = join(instanceRoot, "read-only");
    mkdirSync(readOnlyDir, { recursive: true });
    writeFileSync(join(readOnlyDir, "wakeup.json"), JSON.stringify({
      enabled: true,
      prompts: {
        daily: {
          title: "Daily check",
          prompt: "Initial wakeup prompt",
        },
      },
      schedule: [{
        promptId: "daily",
        timeUtc: "09:00",
      }],
    }, null, 2));

    const store = new InMemoryRuntimeStore();
    store.setStatus("idle");
    const monitorLoop = {
      tick: async (): Promise<MonitoringTickResult> => ({
        observations: [],
        integrationHealth: [],
        findings: [],
        checkedAt: Date.now(),
      }),
    } as MonitoringLoop;

    const gateway = new AgentGateway({
      env: createEnvironment({
        storage: {
          instanceId: "test-instance",
          instanceRoot,
          readOnlyDir,
          workspaceDir: join(instanceRoot, "workspace"),
          storageDir: join(instanceRoot, "storage"),
          stateDir: join(instanceRoot, "storage", "state"),
        },
      }),
      bootedAt: 1,
      brain: {
        reply: async () => "ok",
      } as unknown as BrainService,
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

    const updated = await gateway.updateWakeupConfig({
      enabled: false,
      prompts: {},
      schedule: [],
    });

    expect(updated.wakeup).toEqual({
      enabled: false,
      prompts: {},
      schedule: [],
    });
    expect(JSON.parse(readFileSync(join(readOnlyDir, "wakeup.json"), "utf-8"))).toEqual({
      enabled: false,
      prompts: {},
      schedule: [],
    });

    const bootstrap = await gateway.bootstrap();
    expect(bootstrap.wakeup).toEqual({
      enabled: false,
      prompts: {},
      schedule: [],
    });
  });
});
