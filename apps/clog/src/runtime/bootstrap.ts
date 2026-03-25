import type { AgentRuntimeSummary } from "@clog/types";
import { MonitoringLoop } from "./ai/agent/monitor-loop";
import { AssistantService } from "./ai/assistant";
import { loadAgentEnvironment, type AgentEnvironment } from "../config";
import { AgentGateway } from "../gateway/service";
import { GitHubIntegrationClient } from "../gateway/integrations/github/client";
import { PostHogIntegrationClient } from "../gateway/integrations/posthog/client";
import { VercelIntegrationClient } from "../gateway/integrations/vercel/client";
import { PostHogApiClient } from "./ai/tools/posthog-api";
import { PostHogCliTool } from "./ai/tools/posthog-cli";
import { SqliteRuntimeStore } from "./storage/sqlite";
import type { RuntimeStore } from "./storage/store";

export interface RuntimeBootstrap {
  readonly env: AgentEnvironment;
  readonly bootedAt: number;
  readonly store: RuntimeStore;
  readonly assistant: AssistantService;
  readonly monitorLoop: MonitoringLoop;
  readonly gateway: AgentGateway;
  readonly runtimeSummary: AgentRuntimeSummary;
  readonly posthogApi: PostHogApiClient;
  readonly posthogCli: PostHogCliTool;
}

export const bootstrapRuntime = (): RuntimeBootstrap => {
  const env = loadAgentEnvironment();
  const bootedAt = Date.now();
  const store = new SqliteRuntimeStore(env.storage);
  store.setStatus("booting");
  const assistant = new AssistantService();
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
    assistant,
    monitorLoop,
    posthog,
    posthogApi,
    posthogCli,
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
    assistant,
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
