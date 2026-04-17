import type { AgentRuntimeSummary } from "@clog/types";
import { loadAgentEnvironment, type AgentEnvironment } from "./config";
import { BrainService } from "./brain/service";
import { AgentGateway } from "./gateway/service";
import { GitHubIntegrationClient } from "./integrations/github/client";
import { NotionApiClient } from "./integrations/notion/api-client";
import { NotionIntegrationClient } from "./integrations/notion/client";
import { PostHogIntegrationClient } from "./integrations/posthog/client";
import { PostHogApiClient } from "./integrations/posthog/api-client";
import { PostHogCliTool } from "./integrations/posthog/cli-tool";
import { buildPostHogDashboardSnapshot } from "./integrations/posthog/dashboard-snapshot";
import { getPostHogDocumentedToolCatalog } from "./integrations/posthog/documented-tool-catalog";
import { PostHogWorkspaceReporter } from "./integrations/posthog/workspace-reporter";
import { VercelIntegrationClient } from "./integrations/vercel/client";
import { MonitoringLoop } from "./monitoring/monitor-loop";
import { syncRuntimeInstanceTemplate } from "../../../tests/runtime-instance-template";
import { FileRuntimeStore } from "./storage/file-runtime-store";
import type { RuntimeStore } from "./storage/chat";
import { RuntimeReadService } from "./runtime/read-service";
import { RuntimeOrchestrationService } from "./runtime/orchestration-service";
import { ToolExecutor } from "./execution/tool-executor";
import { ShellExecutor } from "./execution/shell-executor";
import { buildProviderTools, resolveEnabledTools } from "./tools/registry";
import type { PostHogToolServices } from "./tools/types";

export interface RuntimeBootstrap {
  readonly env: AgentEnvironment;
  readonly bootedAt: number;
  readonly store: RuntimeStore;
  readonly brain: BrainService;
  readonly monitorLoop: MonitoringLoop;
  readonly gateway: AgentGateway;
  readonly runtimeSummary: AgentRuntimeSummary;
  readonly posthogApi: PostHogApiClient;
  readonly posthogCli: PostHogCliTool;
}

export const bootstrapRuntime = (): RuntimeBootstrap => {
  syncRuntimeInstanceTemplate();
  const env = loadAgentEnvironment();
  const bootedAt = Date.now();
  const store = new FileRuntimeStore(env.storage);
  store.setStatus("booting");
  const posthogApi = new PostHogApiClient(env.posthog);
  const notionApi = new NotionApiClient(env.notion);
  const posthogCli = new PostHogCliTool(env.posthog);
  const posthogWorkspaceReporter = new PostHogWorkspaceReporter(env.storage.workspaceDir);
  const runtimeReadService = new RuntimeReadService({
    storage: env.storage,
    store,
  });
  const posthog = new PostHogIntegrationClient({
    api: posthogApi,
    config: env.posthog,
    capabilities: env.capabilities.posthog,
  });
  const notion = new NotionIntegrationClient(env.notion);
  let toolExecutor: ToolExecutor | null = null;
  const recordAsync = async <T>(operation: string, execute: () => Promise<T>): Promise<T> => {
    const result = await execute();
    posthogWorkspaceReporter.record(operation, result);
    return result;
  };
  const recordSync = <T>(operation: string, execute: () => T): T => {
    const result = execute();
    posthogWorkspaceReporter.record(operation, result);
    return result;
  };
  const posthogServices: PostHogToolServices = {
    getOrganizations: async () => await recordAsync("organizations", async () => await posthogApi.getOrganizations()),
    getProjects: async (organizationId?: string) => await recordAsync(
      "projects",
      async () => await posthogApi.getProjects(organizationId),
    ),
    listMcpTools: async (input) => await recordAsync(
      "mcpTools",
      async () => await posthogApi.listMcpTools(input),
    ),
    callMcpTool: async (toolName: string, args?: Record<string, unknown>) => await recordAsync(
      "mcpCall",
      async () => await posthogApi.callMcpTool(toolName, args),
    ),
    runQuery: async (name: string, query: string, refresh?: string) => await recordAsync(
      "query",
      async () => await posthogApi.runQuery(name, query, refresh),
    ),
    listErrors: async () => await recordAsync("errors", async () => await posthog.listErrorObservations()),
    getDashboardSnapshot: async (input = {}) => await recordAsync(
      "dashboardSnapshot",
      async () => await buildPostHogDashboardSnapshot({
        windowMinutes: input.windowMinutes,
        topPathsLimit: input.topPathsLimit,
        runQuery: async (name, query) => await posthogApi.runQuery(name, query),
      }),
    ),
    getDocumentedToolCatalog: async (input = {}) => await recordAsync(
      "documentedToolCatalog",
      async () => getPostHogDocumentedToolCatalog(input),
    ),
    queryInsight: async (name: string, query: string) => await recordAsync(
      "insight",
      async () => await posthogApi.runInsightQuery(name, query),
    ),
    listEndpoints: (cwd?: string) => recordSync(
      "endpointList",
      () => posthogCli.listEndpoints(cwd),
    ),
    diffEndpoints: (path: string, cwd?: string) => recordSync(
      "endpointDiff",
      () => posthogCli.diffEndpoints(path, cwd),
    ),
    runEndpoint: (input) => recordSync(
      "endpointRun",
      () => posthogCli.runEndpoint(input),
    ),
  };
  const runtimeOrchestrationService = new RuntimeOrchestrationService({
    capabilities: env.capabilities,
    executeTool: async (toolName, args) => {
      if (!toolExecutor) {
        throw new Error("Tool executor is not ready");
      }
      return await toolExecutor.execute(toolName, args);
    },
  });
  const runtimeServices = {
    getStateSnapshot: (input?: Parameters<RuntimeReadService["getStateSnapshot"]>[0]) => runtimeReadService.getStateSnapshot(input),
    getRecentLogs: (input?: Parameters<RuntimeReadService["getRecentLogs"]>[0]) => runtimeReadService.getRecentLogs(input),
    getMonitoringSnapshot: (input?: Parameters<RuntimeReadService["getMonitoringSnapshot"]>[0]) => runtimeReadService.getMonitoringSnapshot(input),
    listActions: (input?: Parameters<RuntimeOrchestrationService["listActions"]>[0]) => runtimeOrchestrationService.listActions(input),
    runAction: async (input: Parameters<RuntimeOrchestrationService["runAction"]>[0]) => await runtimeOrchestrationService.runAction(input),
    listRoutines: (input?: Parameters<RuntimeOrchestrationService["listRoutines"]>[0]) => runtimeOrchestrationService.listRoutines(input),
    runRoutine: async (input: Parameters<RuntimeOrchestrationService["runRoutine"]>[0]) => await runtimeOrchestrationService.runRoutine(input),
    readKnowledge: (input?: Parameters<RuntimeReadService["readKnowledge"]>[0]) => runtimeReadService.readKnowledge(input),
    readJson: (input: Parameters<RuntimeReadService["readJson"]>[0]) => runtimeReadService.readJson(input),
  };
  toolExecutor = new ToolExecutor({
    capabilities: env.capabilities,
    services: {
      posthog: posthogServices,
      notion: {
        getTodoList: async (input) => await notionApi.getTodoList(input),
      },
      runtime: runtimeServices,
      shell: {
        safeRoots: env.capabilities.shell.safeRoots,
        execute: (input) => ShellExecutor.execute(input, env.capabilities.shell.safeRoots),
      },
      github: null,
      vercel: null,
    },
  });
  const toolVisibility = {
    hidePosthogContextTools: env.hidePosthogContextTools,
  };
  const registeredTools = resolveEnabledTools(env.capabilities, toolVisibility);
  const brain = new BrainService({
    aiConfig: env.ai,
    executionMode: env.executionMode,
    availableTools: env.availableTools,
    runtimeContext: env.runtimeContext,
    registeredTools,
    providerTools: buildProviderTools(env.capabilities, toolVisibility),
    toolExecutor,
  });
  const github = new GitHubIntegrationClient();
  const vercel = new VercelIntegrationClient();
  const monitorLoop = new MonitoringLoop({
    store,
    posthog,
    github,
    vercel,
    notion,
  });
  const gateway = new AgentGateway({
    env,
    bootedAt,
    brain,
    monitorLoop,
    posthog,
    posthogServices,
    notionServices: {
      getTodoList: async (input) => await notionApi.getTodoList(input),
    },
    store,
  });

  for (const channel of env.channels) {
    store.seedOperatorThread(channel);
  }

  store.setStatus("idle");

  return {
    env,
    bootedAt,
    store,
    brain,
    monitorLoop,
    gateway,
    runtimeSummary: {
      name: env.appName,
      status: store.getStatus(),
      executionMode: env.executionMode,
      monitorIntervalMs: env.monitorIntervalMs,
      bootedAt,
      activeIntegrations: env.capabilities.notion.canReadTodo
        ? ["posthog", "github", "vercel", "chat", "notion"]
        : ["posthog", "github", "vercel", "chat"],
    },
    posthogApi,
    posthogCli,
  };
};
