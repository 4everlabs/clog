import { join, resolve } from "node:path";
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

const readInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readOptionalString = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const normalizeHost = (value: string | undefined, fallback: string): string => {
  const host = readOptionalString(value) ?? fallback;
  return host.replace(/\/+$/u, "");
};

const resolveWorkspacePath = (value: string | undefined, fallback: string): string => {
  const target = readOptionalString(value) ?? fallback;
  return resolve(process.cwd(), target);
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

export interface PostHogInsightMonitorConfig {
  readonly name: string;
  readonly query: string;
  readonly regressionThresholdPercent: number;
  readonly minimumPreviousValue: number;
}

export interface PostHogRuntimeConfig {
  readonly host: string;
  readonly projectId: string | null;
  readonly personalApiKey: string | null;
  readonly projectApiKey: string | null;
  readonly featureFlagsSecureApiKey: string | null;
  readonly endpointsDir: string;
  readonly cliBin: string;
  readonly cliTimeoutMs: number;
  readonly requestTimeoutMs: number;
  readonly enableLogs: boolean;
  readonly enableFlags: boolean;
  readonly enableExperiments: boolean;
  readonly errorLookbackMinutes: number;
  readonly errorSpikeThreshold: number;
  readonly errorSpikeMultiplier: number;
  readonly criticalErrorThreshold: number;
  readonly insightMonitors: readonly PostHogInsightMonitorConfig[];
}

export interface RuntimeStorageConfig {
  readonly instanceId: string;
  readonly instanceRoot: string;
  readonly brainDir: string;
  readonly brainStorageDir: string;
  readonly databasePath: string;
}

const readInsightMonitor = (
  env: NodeJS.ProcessEnv,
  prefix: "POSTHOG_CLAW_POSTHOG_PRIMARY_INSIGHT" | "POSTHOG_CLAW_POSTHOG_SECONDARY_INSIGHT",
  fallbackName: string,
): PostHogInsightMonitorConfig | null => {
  const query = readOptionalString(env[`${prefix}_QUERY`]);
  if (!query) {
    return null;
  }

  return {
    name: readOptionalString(env[`${prefix}_NAME`]) ?? fallbackName,
    query,
    regressionThresholdPercent: Math.max(1, readNumber(env[`${prefix}_REGRESSION_THRESHOLD_PERCENT`], 20)),
    minimumPreviousValue: Math.max(1, readNumber(env[`${prefix}_MIN_PREVIOUS_VALUE`], 1)),
  };
};

const createPostHogConfig = (env: NodeJS.ProcessEnv): PostHogRuntimeConfig => {
  const primaryInsight = readInsightMonitor(env, "POSTHOG_CLAW_POSTHOG_PRIMARY_INSIGHT", "Primary insight monitor");
  const secondaryInsight = readInsightMonitor(env, "POSTHOG_CLAW_POSTHOG_SECONDARY_INSIGHT", "Secondary insight monitor");

  return {
    host: normalizeHost(env.POSTHOG_CLAW_POSTHOG_HOST, "https://us.posthog.com"),
    projectId: readOptionalString(env.POSTHOG_CLAW_POSTHOG_PROJECT_ID),
    personalApiKey: readOptionalString(env.POSTHOG_CLAW_POSTHOG_PERSONAL_API_KEY),
    projectApiKey: readOptionalString(env.POSTHOG_CLAW_POSTHOG_PROJECT_API_KEY),
    featureFlagsSecureApiKey: readOptionalString(env.POSTHOG_CLAW_POSTHOG_FEATURE_FLAGS_SECURE_KEY),
    endpointsDir: resolveWorkspacePath(env.POSTHOG_CLAW_POSTHOG_ENDPOINTS_DIR, "posthog/endpoints"),
    cliBin: readOptionalString(env.POSTHOG_CLAW_POSTHOG_CLI_BIN) ?? "posthog-cli",
    cliTimeoutMs: Math.max(1_000, readInteger(env.POSTHOG_CLAW_POSTHOG_CLI_TIMEOUT_MS, 30_000)),
    requestTimeoutMs: Math.max(1_000, readInteger(env.POSTHOG_CLAW_POSTHOG_REQUEST_TIMEOUT_MS, 10_000)),
    enableLogs: readBoolean(env.POSTHOG_CLAW_POSTHOG_ENABLE_LOGS, false),
    enableFlags: readBoolean(env.POSTHOG_CLAW_POSTHOG_ENABLE_FLAGS, false),
    enableExperiments: readBoolean(env.POSTHOG_CLAW_POSTHOG_ENABLE_EXPERIMENTS, false),
    errorLookbackMinutes: Math.max(5, readInteger(env.POSTHOG_CLAW_POSTHOG_ERROR_LOOKBACK_MINUTES, 30)),
    errorSpikeThreshold: Math.max(1, readInteger(env.POSTHOG_CLAW_POSTHOG_ERROR_SPIKE_THRESHOLD, 10)),
    errorSpikeMultiplier: Math.max(1, readNumber(env.POSTHOG_CLAW_POSTHOG_ERROR_SPIKE_MULTIPLIER, 2)),
    criticalErrorThreshold: Math.max(1, readInteger(env.POSTHOG_CLAW_POSTHOG_CRITICAL_ERROR_THRESHOLD, 25)),
    insightMonitors: [primaryInsight, secondaryInsight].filter((monitor): monitor is PostHogInsightMonitorConfig => monitor !== null),
  };
};

const hasPostHogManagementAccess = (config: PostHogRuntimeConfig): boolean =>
  Boolean(config.projectId && config.personalApiKey);

const createRuntimeStorageConfig = (env: NodeJS.ProcessEnv): RuntimeStorageConfig => {
  const instanceId = readOptionalString(env.POSTHOG_CLAW_INSTANCE_ID) ?? "personal-instance";
  const instanceRoot = resolveWorkspacePath(env.POSTHOG_CLAW_INSTANCE_ROOT, `.runtime/instances/${instanceId}`);
  const brainDir = resolve(instanceRoot, "brain");
  const brainStorageDir = resolveWorkspacePath(env.POSTHOG_CLAW_BRAIN_STORAGE_DIR, join(brainDir, "storage"));
  const databasePath = resolveWorkspacePath(
    env.POSTHOG_CLAW_RUNTIME_DB_PATH,
    join(brainStorageDir, "runtime.sqlite"),
  );

  return {
    instanceId,
    instanceRoot,
    brainDir,
    brainStorageDir,
    databasePath,
  };
};

export interface AgentEnvironment {
  readonly appName: string;
  readonly port: number;
  readonly executionMode: AgentExecutionMode;
  readonly monitorIntervalMs: number;
  readonly channels: readonly SurfaceChannelKind[];
  readonly posthog: PostHogRuntimeConfig;
  readonly storage: RuntimeStorageConfig;
  readonly capabilities: IntegrationCapabilitySnapshot;
}

export const loadAgentEnvironment = (env: NodeJS.ProcessEnv = process.env): AgentEnvironment => {
  const channels = readChannels(env.POSTHOG_CLAW_CHANNELS);
  const canCreatePullRequest = readBoolean(env.POSTHOG_CLAW_GITHUB_PR, true);
  const canPushBranch = readBoolean(env.POSTHOG_CLAW_GITHUB_PUSH, true);
  const requestedPort = readInteger(env.PORT, 3000);
  const posthog = createPostHogConfig(env);
  const storage = createRuntimeStorageConfig(env);
  const hasPostHogAccess = hasPostHogManagementAccess(posthog);

  return {
    appName: env.POSTHOG_CLAW_APP_NAME?.trim() || "PostHog Claw",
    port: Number.isFinite(requestedPort) ? requestedPort : 3000,
    executionMode: readExecutionMode(env.POSTHOG_CLAW_EXECUTION_MODE),
    monitorIntervalMs: Math.max(5_000, readInteger(env.POSTHOG_CLAW_MONITOR_INTERVAL_MS, 60_000)),
    channels,
    posthog,
    storage,
    capabilities: {
      posthog: {
        canReadInsights: hasPostHogAccess && readBoolean(env.POSTHOG_CLAW_POSTHOG_READ_INSIGHTS, true),
        canReadErrors: hasPostHogAccess && readBoolean(env.POSTHOG_CLAW_POSTHOG_READ_ERRORS, true),
        canReadLogs: hasPostHogAccess && readBoolean(env.POSTHOG_CLAW_POSTHOG_READ_LOGS, false),
        canReadFlags: hasPostHogAccess && readBoolean(env.POSTHOG_CLAW_POSTHOG_READ_FLAGS, false),
        canReadExperiments: hasPostHogAccess && readBoolean(env.POSTHOG_CLAW_POSTHOG_READ_EXPERIMENTS, false),
        canManageEndpoints: hasPostHogAccess && readBoolean(env.POSTHOG_CLAW_POSTHOG_MANAGE_ENDPOINTS, false),
        canUploadSourcemaps: hasPostHogAccess && readBoolean(env.POSTHOG_CLAW_POSTHOG_UPLOAD_SOURCEMAPS, false),
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
      shell: {
        canExecute: readBoolean(env.POSTHOG_CLAW_SHELL_EXECUTE, true),
        safeCommands: ["ls", "cat", "rg", "grep", "head", "tail", "wc", "find"],
        safeRoots: [
          process.cwd(),
          join(process.cwd(), ".runtime"),
          join(process.cwd(), ".runtime", "workspace"),
        ],
      },
    },
  };
};
