import type { AgentRuntimeSummary } from "@clog/types";
import { loadAgentEnvironment, type AgentEnvironment } from "./config";
import { BrainService } from "./brain/service";
import { AgentGateway } from "./gateway/service";
import { GitHubIntegrationClient } from "./integrations/github/client";
import { PostHogIntegrationClient } from "./integrations/posthog/client";
import { PostHogApiClient } from "./integrations/posthog/api-client";
import { PostHogCliTool } from "./integrations/posthog/cli-tool";
import { VercelIntegrationClient } from "./integrations/vercel/client";
import { MonitoringLoop } from "./monitoring/monitor-loop";
import { SqliteRuntimeStore } from "./storage/sqlite";
import type { RuntimeStore } from "./storage/store";

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
  const env = loadAgentEnvironment();
  const bootedAt = Date.now();
  const store = new SqliteRuntimeStore(env.storage);
  store.setStatus("booting");
  const brain = new BrainService();
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
    brain,
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
