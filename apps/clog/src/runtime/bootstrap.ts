import type { AgentRuntimeSummary } from "@clog/types";
import { loadAgentEnvironment, type AgentEnvironment } from "./config";
import { BrainService } from "../ai/brain/service";
import { loadRuntimeWakeupPrompt } from "./config/wakeup";
import { AgentGateway } from "./gateway/service";
import { ConvexApiClient } from "../ai/integrations/convex/api-client";
import { ConvexIntegrationClient } from "../ai/integrations/convex/client";
import { GitHubIntegrationClient } from "../ai/integrations/github/client";
import { NotionApiClient } from "../ai/integrations/notion/api-client";
import { NotionIntegrationClient } from "../ai/integrations/notion/client";
import { PostHogIntegrationClient } from "../ai/integrations/posthog/client";
import { PostHogApiClient } from "../ai/integrations/posthog/api-client";
import { PostHogCliTool } from "../ai/integrations/posthog/cli-tool";
import { createPostHogToolServices } from "../ai/integrations/posthog/tool-services";
import { PostHogWorkspaceReporter } from "../ai/integrations/posthog/workspace-reporter";
import { VercelIntegrationClient } from "../ai/integrations/vercel/client";
import { MonitoringLoop } from "./monitor-loop";
import { syncRuntimeInstanceTemplate } from "../../../../tests/runtime-instance-template";
import { FileRuntimeStore } from "../storage/file-runtime-store";
import type { RuntimeStore } from "../storage/chat";
import { RuntimeReadService } from "./read-service";
import { RuntimeOrchestrationService } from "./orchestration-service";
import { ToolExecutor } from "../ai/tools/tool-executor";
import { ShellExecutor } from "../ai/tools/shell-executor";
import { buildProviderTools, resolveAdvertisedTools } from "../ai/tools/registry";

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
  const convexApi = new ConvexApiClient(env.convex);
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
  const convex = new ConvexIntegrationClient(env.convex);
  const notion = new NotionIntegrationClient(env.notion);
  let toolExecutor: ToolExecutor | null = null;
  const posthogServices = createPostHogToolServices({
    posthogApi,
    posthog,
    posthogCli,
    posthogWorkspaceReporter,
  });
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
    listConversations: (input?: Parameters<RuntimeReadService["listConversations"]>[0]) => runtimeReadService.listConversations(input),
    getConversation: (input: Parameters<RuntimeReadService["getConversation"]>[0]) => runtimeReadService.getConversation(input),
    searchMessages: (input: Parameters<RuntimeReadService["searchMessages"]>[0]) => runtimeReadService.searchMessages(input),
    getRecentLogs: (input?: Parameters<RuntimeReadService["getRecentLogs"]>[0]) => runtimeReadService.getRecentLogs(input),
    getMonitoringSnapshot: (input?: Parameters<RuntimeReadService["getMonitoringSnapshot"]>[0]) => runtimeReadService.getMonitoringSnapshot(input),
    listActions: (input?: Parameters<RuntimeOrchestrationService["listActions"]>[0]) => runtimeOrchestrationService.listActions(input),
    runAction: async (input: Parameters<RuntimeOrchestrationService["runAction"]>[0]) => await runtimeOrchestrationService.runAction(input),
    listRoutines: (input?: Parameters<RuntimeOrchestrationService["listRoutines"]>[0]) => runtimeOrchestrationService.listRoutines(input),
    runRoutine: async (input: Parameters<RuntimeOrchestrationService["runRoutine"]>[0]) => await runtimeOrchestrationService.runRoutine(input),
    readKnowledge: (input?: Parameters<RuntimeReadService["readKnowledge"]>[0]) => runtimeReadService.readKnowledge(input),
    readJson: (input: Parameters<RuntimeReadService["readJson"]>[0]) => runtimeReadService.readJson(input),
    writeWorkspaceFile: (input: Parameters<RuntimeReadService["writeWorkspaceFile"]>[0]) => runtimeReadService.writeWorkspaceFile(input),
  };
  toolExecutor = new ToolExecutor({
    capabilities: env.capabilities,
    services: {
      posthog: posthogServices,
      convex: {
        runQuery: async (input) => await convexApi.runQuery(input),
      },
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
  const registeredTools = resolveAdvertisedTools(env.capabilities, toolVisibility);
  const brain = new BrainService({
    aiConfig: env.ai,
    executionMode: env.executionMode,
    availableTools: env.availableTools,
    runtimeContext: env.runtimeContext,
    registeredTools,
    providerTools: buildProviderTools(env.capabilities, toolVisibility),
    toolExecutor,
    loadWakeupPrompt: (sharedWakeupPrompt) => loadRuntimeWakeupPrompt(sharedWakeupPrompt),
  });
  const github = new GitHubIntegrationClient();
  const vercel = new VercelIntegrationClient();
  const monitorLoop = new MonitoringLoop({
    store,
    posthog,
    convex,
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
      activeIntegrations: [
        "posthog",
        ...(env.capabilities.convex.canReadData ? ["convex"] as const : []),
        "github",
        "vercel",
        "chat",
        ...(env.capabilities.notion.canReadTodo ? ["notion"] as const : []),
      ],
    },
    posthogApi,
    posthogCli,
  };
};
