import type { AgentRuntimeSummary, SurfaceChannelKind } from "@clog/types";
import { MonitoringLoop } from "../agent/monitor-loop";
import { RemediationPlanner } from "../agent/planner";
import { loadAgentEnvironment, type AgentEnvironment } from "../config/env";
import { AgentGateway } from "../gateway/service";
import { NullChatAdapter } from "../integrations/chat/adapter";
import { GitHubIntegrationClient } from "../integrations/github/client";
import { PostHogIntegrationClient } from "../integrations/posthog/client";
import { VercelIntegrationClient } from "../integrations/vercel/client";
import { VercelAiRuntime } from "./ai/vercel";
import { InMemoryRuntimeStore } from "../storage/in-memory-runtime-store";

export interface RuntimeBootstrap {
  readonly env: AgentEnvironment;
  readonly bootedAt: number;
  readonly store: InMemoryRuntimeStore;
  readonly planner: RemediationPlanner;
  readonly monitorLoop: MonitoringLoop;
  readonly gateway: AgentGateway;
  readonly runtimeSummary: AgentRuntimeSummary;
  readonly chatAdapters: ReadonlyMap<SurfaceChannelKind, NullChatAdapter>;
  readonly aiRuntime: VercelAiRuntime;
}

export const bootstrapRuntime = (): RuntimeBootstrap => {
  const env = loadAgentEnvironment();
  const bootedAt = Date.now();
  const store = new InMemoryRuntimeStore();
  const planner = new RemediationPlanner();
  const posthog = new PostHogIntegrationClient();
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
    store,
  });
  const aiRuntime = VercelAiRuntime.create();
  const chatAdapters = new Map(env.channels.map((channel) => [channel, new NullChatAdapter(channel)]));

  for (const channel of env.channels) {
    store.seedOperatorThread(channel);
  }

  store.setStatus("idle");

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
  };
};
