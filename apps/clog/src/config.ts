import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { AgentExecutionMode, IntegrationCapabilitySnapshot, SurfaceChannelKind } from "@clog/types";
import { z } from "zod";
import type { ToolSummary } from "./schema/tools";
import { RuntimeToolsConfigSchema, type RuntimeToolsConfig } from "./schema/tools";
import { summarizeEnabledTools } from "./tools/registry";

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

const RuntimeSettingsSchema = z.object({
  monitor: z.object({
    intervalMs: z.number().finite().optional(),
  }).strict().optional(),
  posthog: z.object({
    context: z.string().trim().min(1).optional(),
  }).strict().optional(),
}).passthrough();

type RuntimeSettings = z.infer<typeof RuntimeSettingsSchema>;

const normalizeHost = (value: string | undefined, fallback: string): string => {
  const host = readOptionalString(value) ?? fallback;
  return host.replace(/\/+$/u, "");
};

const readOptionalJson = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
};

const resolveWorkspacePath = (value: string | undefined, fallback: string): string => {
  const target = readOptionalString(value) ?? fallback;
  return resolve(process.cwd(), target);
};

const isWithinRoot = (candidate: string, root: string): boolean => {
  const normalizedCandidate = resolve(candidate);
  const normalizedRoot = resolve(root);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
};

const resolvePathWithinRoot = (
  value: string | undefined,
  fallback: string,
  root: string,
  label: string,
): string => {
  const target = readOptionalString(value) ?? fallback;
  const candidate = resolve(root, target);
  if (!isWithinRoot(candidate, root)) {
    throw new Error(`${label} must stay inside ${root}. Received: ${candidate}`);
  }
  return candidate;
};

export const getRuntimeProcessEnv = (): NodeJS.ProcessEnv => {
  return typeof Bun !== "undefined" ? Bun.env : process.env;
};

const readChannels = (value: string | undefined): SurfaceChannelKind[] => {
  const requested = (value ?? "tui")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const channels = requested.filter((entry): entry is SurfaceChannelKind => (
    entry === "web" || entry === "telegram" || entry === "tui" || entry === "system"
  ));

  return channels.length > 0 ? channels : ["tui"];
};

const appendChannel = (
  channels: readonly SurfaceChannelKind[],
  channel: SurfaceChannelKind,
): SurfaceChannelKind[] => {
  return channels.includes(channel) ? [...channels] : [...channels, channel];
};

export interface PostHogInsightMonitorConfig {
  readonly name: string;
  readonly query: string;
  readonly regressionThresholdPercent: number;
  readonly minimumPreviousValue: number;
}

export interface PostHogRuntimeConfig {
  readonly host: string;
  readonly workspaceDir: string;
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
  readonly readOnlyDir: string;
  readonly workspaceDir: string;
  readonly storageDir: string;
  readonly stateDir: string;
}

export interface AiRuntimeConfig {
  readonly provider: "openrouter" | "openai" | null;
  readonly apiKey: string | null;
  readonly model: string;
  readonly baseUrl: string;
}

export interface TelegramRuntimeConfig {
  readonly botToken: string | null;
  readonly userName: string | null;
  readonly allowedChatIds: readonly number[];
}

export interface NotionRuntimeConfig {
  readonly token: string | null;
  readonly requestTimeoutMs: number;
  readonly todoPageUrl: string | null;
  readonly todoDataSourceId: string | null;
  readonly todoSearchTitle: string;
}

const readRuntimeSettings = (storage: RuntimeStorageConfig): RuntimeSettings | null => {
  const path = join(storage.readOnlyDir, "settings.json");
  const value = readOptionalJson<unknown>(path);
  if (!value) {
    return null;
  }

  const parsed = RuntimeSettingsSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

const readSettingsMonitorIntervalMs = (settings: RuntimeSettings | null): number | null => {
  const intervalMs = settings?.monitor?.intervalMs;
  return typeof intervalMs === "number" && Number.isFinite(intervalMs)
    ? Math.max(5_000, intervalMs)
    : null;
};

const buildRuntimeContextPrompt = (settings: RuntimeSettings | null): string | null => {
  const context = settings?.posthog?.context?.trim();
  return context ? `PostHog context: ${context}` : null;
};

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

const createPostHogConfig = (env: NodeJS.ProcessEnv, storage: RuntimeStorageConfig): PostHogRuntimeConfig => {
  const primaryInsight = readInsightMonitor(env, "POSTHOG_CLAW_POSTHOG_PRIMARY_INSIGHT", "Primary insight monitor");
  const secondaryInsight = readInsightMonitor(env, "POSTHOG_CLAW_POSTHOG_SECONDARY_INSIGHT", "Secondary insight monitor");

  return {
    host: normalizeHost(env.POSTHOG_CLAW_POSTHOG_HOST, "https://us.posthog.com"),
    workspaceDir: storage.workspaceDir,
    projectId: readOptionalString(env.POSTHOG_CLAW_POSTHOG_PROJECT_ID)
      ?? readOptionalString(env.POSTHOG_PROJECT_ID),
    personalApiKey: readOptionalString(env.POSTHOG_CLAW_POSTHOG_PERSONAL_API_KEY)
      ?? readOptionalString(env.POSTHOG_API_KEY),
    projectApiKey: readOptionalString(env.POSTHOG_CLAW_POSTHOG_PROJECT_API_KEY)
      ?? readOptionalString(env.POSTHOG_PROJECT_TOKEN),
    featureFlagsSecureApiKey: readOptionalString(env.POSTHOG_CLAW_POSTHOG_FEATURE_FLAGS_SECURE_KEY),
    endpointsDir: resolvePathWithinRoot(
      env.POSTHOG_CLAW_POSTHOG_ENDPOINTS_DIR,
      "posthog/endpoints",
      storage.workspaceDir,
      "POSTHOG_CLAW_POSTHOG_ENDPOINTS_DIR",
    ),
    cliBin: readOptionalString(env.POSTHOG_CLAW_POSTHOG_CLI_BIN) ?? "posthog-cli",
    cliTimeoutMs: Math.max(1_000, readInteger(env.POSTHOG_CLAW_POSTHOG_CLI_TIMEOUT_MS, 30_000)),
    requestTimeoutMs: Math.max(1_000, readInteger(env.POSTHOG_CLAW_POSTHOG_REQUEST_TIMEOUT_MS, 100_000)),
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

const createAiConfig = (env: NodeJS.ProcessEnv): AiRuntimeConfig => {
  const openRouterApiKey = readOptionalString(env.OPENROUTER_API_KEY);
  const openAiApiKey = readOptionalString(env.OPENAI_API_KEY);
  const usingOpenRouter = Boolean(openRouterApiKey);

  return {
    provider: openRouterApiKey ? "openrouter" : (openAiApiKey ? "openai" : null),
    apiKey: openRouterApiKey ?? openAiApiKey,
    model: readOptionalString(env.OPENROUTER_MODEL) ?? (usingOpenRouter ? "stepfun/step-3.5-flash" : "gpt-4o-mini"),
    baseUrl: usingOpenRouter ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1",
  };
};

const createRuntimeStorageConfig = (env: NodeJS.ProcessEnv): RuntimeStorageConfig => {
  const instanceId = readOptionalString(env.POSTHOG_CLAW_INSTANCE_ID) ?? "personal-instance";
  const instanceRoot = resolveWorkspacePath(env.POSTHOG_CLAW_INSTANCE_ROOT, `.runtime/instances/${instanceId}`);
  const readOnlyDir = join(instanceRoot, "read-only");
  const workspaceDir = join(instanceRoot, "workspace");
  const storageDir = resolveWorkspacePath(env.POSTHOG_CLAW_STORAGE_DIR, join(instanceRoot, "storage"));
  const stateDir = resolvePathWithinRoot(
    env.POSTHOG_CLAW_RUNTIME_STATE_DIR,
    "state",
    storageDir,
    "POSTHOG_CLAW_RUNTIME_STATE_DIR",
  );

  return {
    instanceId,
    instanceRoot,
    readOnlyDir,
    workspaceDir,
    storageDir,
    stateDir,
  };
};

const readToolFlag = (value: boolean | undefined, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const readAllowedChatIds = (value: string | undefined): number[] => {
  return (value ?? "")
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isFinite(entry));
};

const createTelegramConfig = (env: NodeJS.ProcessEnv): TelegramRuntimeConfig => {
  const userName = readOptionalString(env.TELEGRAM_BOT_USERNAME)?.replace(/^@/u, "") ?? null;
  return {
    botToken: readOptionalString(env.TELEGRAM_BOT_TOKEN),
    userName,
    allowedChatIds: readAllowedChatIds(env.TELEGRAM_ALLOWED_CHATS),
  };
};

const createNotionConfig = (env: NodeJS.ProcessEnv): NotionRuntimeConfig => {
  return {
    token: readOptionalString(env.POSTHOG_CLAW_NOTION_TOKEN) ?? readOptionalString(env.NOTION_SECRET),
    requestTimeoutMs: Math.max(1_000, readInteger(env.POSTHOG_CLAW_NOTION_REQUEST_TIMEOUT_MS, 30_000)),
    todoPageUrl: readOptionalString(env.POSTHOG_CLAW_NOTION_TODO_URL),
    todoDataSourceId: readOptionalString(env.POSTHOG_CLAW_NOTION_TODO_DATA_SOURCE_ID),
    todoSearchTitle: readOptionalString(env.POSTHOG_CLAW_NOTION_TODO_TITLE) ?? "Pre Beta To Do",
  };
};

const readRuntimeToolsConfig = (storage: RuntimeStorageConfig): RuntimeToolsConfig | null => {
  const path = join(storage.readOnlyDir, "tools.json");
  const value = readOptionalJson<unknown>(path);
  if (!value) {
    return null;
  }

  const parsed = RuntimeToolsConfigSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid runtime tools config at ${path}: ${parsed.error.message}`);
  }

  return parsed.data;
};

export interface AgentEnvironment {
  readonly appName: string;
  readonly port: number;
  readonly executionMode: AgentExecutionMode;
  readonly monitorIntervalMs: number;
  readonly runtimeContext: string | null;
  readonly hidePosthogContextTools: boolean;
  readonly channels: readonly SurfaceChannelKind[];
  readonly posthog: PostHogRuntimeConfig;
  readonly ai: AiRuntimeConfig;
  readonly telegram: TelegramRuntimeConfig;
  readonly notion: NotionRuntimeConfig;
  readonly storage: RuntimeStorageConfig;
  readonly capabilities: IntegrationCapabilitySnapshot;
  readonly availableTools: readonly ToolSummary[];
}

export const loadAgentEnvironment = (env: NodeJS.ProcessEnv = getRuntimeProcessEnv()): AgentEnvironment => {
  const requestedChannels = readChannels(env.POSTHOG_CLAW_CHANNELS);
  const canCreatePullRequest = readBoolean(env.POSTHOG_CLAW_GITHUB_PR, false);
  const canPushBranch = readBoolean(env.POSTHOG_CLAW_GITHUB_PUSH, false);
  const requestedPort = readInteger(env.PORT, 6900);
  const storage = createRuntimeStorageConfig(env);
  const runtimeSettings = readRuntimeSettings(storage);
  const posthog = createPostHogConfig(env, storage);
  const ai = createAiConfig(env);
  const telegram = createTelegramConfig(env);
  const notion = createNotionConfig(env);
  const channels = telegram.botToken ? appendChannel(requestedChannels, "telegram") : requestedChannels;
  const monitorIntervalMs = readSettingsMonitorIntervalMs(runtimeSettings) ?? 60_000;
  const runtimeTools = readRuntimeToolsConfig(storage);
  const runtimeContext = buildRuntimeContextPrompt(runtimeSettings);
  const hidePosthogContextTools = Boolean(runtimeContext);
  const hasPostHogAccess = hasPostHogManagementAccess(posthog);
  const capabilities: IntegrationCapabilitySnapshot = {
    posthog: {
      canReadInsights: hasPostHogAccess && readToolFlag(
        runtimeTools?.posthog?.readInsights,
        readBoolean(env.POSTHOG_CLAW_POSTHOG_READ_INSIGHTS, true),
      ),
      canReadErrors: hasPostHogAccess && readToolFlag(
        runtimeTools?.posthog?.readErrors,
        readBoolean(env.POSTHOG_CLAW_POSTHOG_READ_ERRORS, true),
      ),
      canReadLogs: hasPostHogAccess && readToolFlag(
        runtimeTools?.posthog?.readLogs,
        readBoolean(env.POSTHOG_CLAW_POSTHOG_READ_LOGS, false),
      ),
      canReadFlags: hasPostHogAccess && readToolFlag(
        runtimeTools?.posthog?.readFlags,
        readBoolean(env.POSTHOG_CLAW_POSTHOG_READ_FLAGS, false),
      ),
      canReadExperiments: hasPostHogAccess && readToolFlag(
        runtimeTools?.posthog?.readExperiments,
        readBoolean(env.POSTHOG_CLAW_POSTHOG_READ_EXPERIMENTS, false),
      ),
      canManageEndpoints: hasPostHogAccess && readToolFlag(
        runtimeTools?.posthog?.manageEndpoints,
        readBoolean(env.POSTHOG_CLAW_POSTHOG_MANAGE_ENDPOINTS, false),
      ),
      canUploadSourcemaps: hasPostHogAccess && readBoolean(env.POSTHOG_CLAW_POSTHOG_UPLOAD_SOURCEMAPS, false),
    },
    github: {
      canReadRepository: readToolFlag(runtimeTools?.github?.readRepository, readBoolean(env.POSTHOG_CLAW_GITHUB_READ, false)),
      canCreatePullRequest: readToolFlag(runtimeTools?.github?.createPullRequests, canCreatePullRequest),
      canPushBranch: readToolFlag(runtimeTools?.github?.pushBranches, canPushBranch),
    },
    vercel: {
      canTriggerDeploy: readToolFlag(runtimeTools?.vercel?.triggerDeploys, readBoolean(env.POSTHOG_CLAW_VERCEL_DEPLOY, false)),
    },
    chat: {
      canSendOperatorMessages: readToolFlag(runtimeTools?.chat?.notifyOperator, readBoolean(env.POSTHOG_CLAW_CHAT_NOTIFY, true)),
      supportedChannels: channels,
    },
    notion: {
      canReadTodo: Boolean(notion.token) && readToolFlag(
        runtimeTools?.notion?.readTodo,
        readBoolean(env.POSTHOG_CLAW_NOTION_READ_TODO, true),
      ),
    },
    shell: {
      canExecute: readToolFlag(runtimeTools?.shell?.execute, readBoolean(env.POSTHOG_CLAW_SHELL_EXECUTE, false)),
      safeCommands: ["ls", "cat", "rg", "grep", "head", "tail", "wc", "find"],
      safeRoots: [
        storage.workspaceDir,
        storage.storageDir,
      ],
    },
  };
  const availableTools = summarizeEnabledTools(capabilities, {
    hidePosthogContextTools,
  });

  return {
    appName: env.POSTHOG_CLAW_APP_NAME?.trim() || "Clog",
    port: Number.isFinite(requestedPort) ? requestedPort : 6900,
    executionMode: readExecutionMode(env.POSTHOG_CLAW_EXECUTION_MODE),
    monitorIntervalMs,
    runtimeContext,
    hidePosthogContextTools,
    channels,
    posthog,
    ai,
    telegram,
    notion,
    storage,
    capabilities,
    availableTools,
  };
};
