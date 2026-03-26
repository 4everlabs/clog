import type { AgentRuntimeSummary } from "@clog/types";
import { loadAgentEnvironment, type AgentEnvironment } from "./config";
import { BrainService } from "./brain/service";
import { AgentGateway } from "./gateway/service";
import { GitHubIntegrationClient } from "./integrations/github/client";
import { PostHogIntegrationClient } from "./integrations/posthog/client";
import { PostHogApiClient } from "./integrations/posthog/api-client";
import { PostHogCliTool } from "./integrations/posthog/cli-tool";
import { PostHogWorkspaceReporter } from "./integrations/posthog/workspace-reporter";
import { VercelIntegrationClient } from "./integrations/vercel/client";
import { MonitoringLoop } from "./monitoring/monitor-loop";
import { syncRuntimeInstanceTemplate } from "../../../tests/runtime-instance-template";
import { SqliteRuntimeStore } from "./storage/sqlite";
import type { RuntimeStore } from "./storage/chat";
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
  const store = new SqliteRuntimeStore(env.storage);
  store.setStatus("booting");
  const posthogApi = new PostHogApiClient(env.posthog);
  const posthogCli = new PostHogCliTool(env.posthog);
  const posthogWorkspaceReporter = new PostHogWorkspaceReporter(env.storage.workspaceDir);
  const posthog = new PostHogIntegrationClient({
    api: posthogApi,
    config: env.posthog,
    capabilities: env.capabilities.posthog,
  });
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
  const toolExecutor = new ToolExecutor({
    capabilities: env.capabilities,
    services: {
      posthog: posthogServices,
      shell: {
        safeRoots: env.capabilities.shell.safeRoots,
        execute: (input) => ShellExecutor.execute(input, env.capabilities.shell.safeRoots),
      },
      github: null,
      vercel: null,
    },
  });
  const registeredTools = resolveEnabledTools(env.capabilities);
  const brain = new BrainService({
    aiConfig: env.ai,
    executionMode: env.executionMode,
    availableTools: env.availableTools,
    registeredTools,
    providerTools: buildProviderTools(env.capabilities),
    toolExecutor,
  });
  const github = new GitHubIntegrationClient();
  const vercel = new VercelIntegrationClient();
  const monitorLoop = new MonitoringLoop({
    store,
    posthog,
    github,
    vercel,
  });
  const gateway = new AgentGateway({
    env,
    bootedAt,
    brain,
    monitorLoop,
    posthog,
    posthogServices,
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
      activeIntegrations: ["posthog", "github", "vercel", "chat"],
    },
    posthogApi,
    posthogCli,
  };
};
