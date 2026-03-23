import type { AgentExecutionMode, IntegrationCapabilitySnapshot, SurfaceChannelKind } from "@clog/types";

const readBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
};

const readExecutionMode = (value: string | undefined): AgentExecutionMode => {
  if (value === "observe" || value === "propose" || value === "execute") {
    return value;
  }
  return "propose";
};

const readChannels = (value: string | undefined): SurfaceChannelKind[] => {
  const requested = (value ?? "web,telegram,cli")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const channels = requested.filter((entry): entry is SurfaceChannelKind => (
    entry === "web" || entry === "telegram" || entry === "cli" || entry === "system"
  ));

  return channels.length > 0 ? channels : ["web", "telegram", "cli"];
};

export interface AgentEnvironment {
  readonly appName: string;
  readonly port: number;
  readonly executionMode: AgentExecutionMode;
  readonly monitorIntervalMs: number;
  readonly channels: readonly SurfaceChannelKind[];
  readonly capabilities: IntegrationCapabilitySnapshot;
}

export const loadAgentEnvironment = (env: NodeJS.ProcessEnv = process.env): AgentEnvironment => {
  const channels = readChannels(env.POSTHOG_CLAW_CHANNELS);
  const canCreatePullRequest = readBoolean(env.POSTHOG_CLAW_GITHUB_PR, true);
  const canPushBranch = readBoolean(env.POSTHOG_CLAW_GITHUB_PUSH, true);
  const requestedPort = Number.parseInt(env.PORT ?? "0", 10);

  return {
    appName: env.POSTHOG_CLAW_APP_NAME?.trim() || "PostHog Claw",
    port: Number.isFinite(requestedPort) ? requestedPort : 0,
    executionMode: readExecutionMode(env.POSTHOG_CLAW_EXECUTION_MODE),
    monitorIntervalMs: Math.max(5_000, Number.parseInt(env.POSTHOG_CLAW_MONITOR_INTERVAL_MS ?? "60000", 10) || 60_000),
    channels,
    capabilities: {
      posthog: {
        canReadInsights: readBoolean(env.POSTHOG_CLAW_POSTHOG_READ_INSIGHTS, true),
        canReadErrors: readBoolean(env.POSTHOG_CLAW_POSTHOG_READ_ERRORS, true),
      },
      github: {
        canReadRepository: readBoolean(env.POSTHOG_CLAW_GITHUB_READ, true),
        canCreatePullRequest,
        canPushBranch,
      },
      vercel: {
        canTriggerDeploy: readBoolean(env.POSTHOG_CLAW_VERCEL_DEPLOY, true),
      },
      chat: {
        canSendOperatorMessages: readBoolean(env.POSTHOG_CLAW_CHAT_NOTIFY, true),
        supportedChannels: channels,
      },
    },
  };
};
