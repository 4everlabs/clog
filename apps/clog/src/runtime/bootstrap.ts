import type { AgentRuntimeSummary, SurfaceChannelKind } from "@clog/types";
import { MonitoringLoop } from "./ai/agent/monitor-loop";
import { RemediationPlanner } from "./ai/agent/planner";
import { AgentLoop } from "./ai/agent/agentloop";
import { ContextAssembler } from "./ai/agent/context-assembler";
import { loadAgentEnvironment, type AgentEnvironment } from "../config";
import { AgentGateway } from "../gateway/service";
import { NullChatAdapter } from "../gateway/integrations/chat/adapter";
import { GitHubIntegrationClient } from "../gateway/integrations/github/client";
import { PostHogIntegrationClient } from "../gateway/integrations/posthog/client";
import { VercelIntegrationClient } from "../gateway/integrations/vercel/client";
import { PostHogApiClient } from "./ai/tools/posthog-api";
import { PostHogCliTool } from "./ai/tools/posthog-cli";
import { VercelAiRuntime } from "./ai/tools/vercel";
import { SqliteRuntimeStore } from "./storage/sqlite";
import type { RuntimeStore } from "./storage/store";
import { createToolRegistry } from "./ai/tools";
import { ToolRegistry } from "./ai/tools/registry";

export interface RuntimeBootstrap {
  readonly env: AgentEnvironment;
  readonly bootedAt: number;
  readonly store: RuntimeStore;
  readonly planner: RemediationPlanner;
  readonly monitorLoop: MonitoringLoop;
  readonly gateway: AgentGateway;
  readonly runtimeSummary: AgentRuntimeSummary;
  readonly chatAdapters: ReadonlyMap<SurfaceChannelKind, NullChatAdapter>;
  readonly aiRuntime: VercelAiRuntime;
  readonly posthogApi: PostHogApiClient;
  readonly posthogCli: PostHogCliTool;
  readonly toolRegistry: ToolRegistry;
  readonly agentLoop: AgentLoop;
}

export const bootstrapRuntime = (): RuntimeBootstrap => {
  const env = loadAgentEnvironment();
  const bootedAt = Date.now();
  const store = new SqliteRuntimeStore(env.storage);
  store.setStatus("booting");
  const planner = new RemediationPlanner();
  const posthogApi = new PostHogApiClient(env.posthog);
  const posthogCli = new PostHogCliTool(env.posthog);
  const posthog = new PostHogIntegrationClient({
    api: posthogApi,
    config: env.posthog,
    capabilities: env.capabilities.posthog,
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
    planner,
    monitorLoop,
    posthog,
    posthogApi,
    posthogCli,
    store,
  });
  const aiRuntime = VercelAiRuntime.create();
  const chatAdapters = new Map(env.channels.map((channel) => [channel, new NullChatAdapter(channel)]));

  for (const channel of env.channels) {
    store.seedOperatorThread(channel);
  }

  store.setStatus("idle");

  // Create tool registry and agent loop
  const toolRegistry = createToolRegistry({
    posthogApi,
    vercel,
    store,
    workspaceRoot: ".runtime/workspace",
  });

  const contextAssembler = new ContextAssembler({
    store,
    workspaceRoot: ".runtime/workspace",
  });

  const agentLoop = new AgentLoop(toolRegistry, contextAssembler);

  return {
    env,
    bootedAt,
    store,
    planner,
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
    chatAdapters,
    aiRuntime,
    posthogApi,
    posthogCli,
    toolRegistry,
    agentLoop,
  };
};
