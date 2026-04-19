import { z } from "zod";

export const DEFAULT_RUNTIME_PORT = 6900;
export const DEFAULT_MONITOR_INTERVAL_MS = 60_000;
export const DEFAULT_CLOG_MODEL = "google/gemma-4-31b-it:free";
export const DEFAULT_UI_TIMEZONE = "America/Los_Angeles";

export const DEFAULT_MODEL_CHOICES = [
  DEFAULT_CLOG_MODEL,
] as const;

const ExecutionModeSchema = z.enum(["observe", "propose", "execute"]);
const ChannelSchema = z.enum(["web", "telegram", "tui", "system"]);

const PostHogInsightMonitorSchema = z.object({
  name: z.string().trim().min(1),
  query: z.string().trim().min(1),
  regressionThresholdPercent: z.number().finite().positive(),
  minimumPreviousValue: z.number().finite().positive(),
}).passthrough();

export const RuntimeSettingsSchema = z.object({
  app: z.object({
    name: z.string().trim().min(1).optional(),
  }).passthrough().optional(),
  runtime: z.object({
    executionMode: ExecutionModeSchema.optional(),
    channels: z.array(ChannelSchema).min(1).optional(),
    port: z.number().int().positive().optional(),
  }).passthrough().optional(),
  monitor: z.object({
    intervalMs: z.number().finite().positive().optional(),
  }).passthrough().optional(),
  ai: z.object({
    model: z.string().trim().min(1).optional(),
    modelChoices: z.array(z.string().trim().min(1)).optional(),
  }).passthrough().optional(),
  posthog: z.object({
    context: z.string().trim().min(1).optional(),
    host: z.string().trim().min(1).optional(),
    endpointsDir: z.string().trim().min(1).optional(),
    cliBin: z.string().trim().min(1).optional(),
    cliTimeoutMs: z.number().finite().positive().optional(),
    requestTimeoutMs: z.number().finite().positive().optional(),
    enableLogs: z.boolean().optional(),
    enableFlags: z.boolean().optional(),
    enableExperiments: z.boolean().optional(),
    errorLookbackMinutes: z.number().finite().positive().optional(),
    errorSpikeThreshold: z.number().finite().positive().optional(),
    errorSpikeMultiplier: z.number().finite().positive().optional(),
    criticalErrorThreshold: z.number().finite().positive().optional(),
    insightMonitors: z.array(PostHogInsightMonitorSchema).optional(),
  }).passthrough().optional(),
  telegram: z.object({
    userName: z.string().trim().min(1).optional(),
    allowedChatIds: z.array(z.number().int()).optional(),
  }).passthrough().optional(),
  notion: z.object({
    requestTimeoutMs: z.number().finite().positive().optional(),
    todoPageUrl: z.string().trim().min(1).optional(),
    todoDataSourceId: z.string().trim().min(1).optional(),
    todoSearchTitle: z.string().trim().min(1).optional(),
  }).passthrough().optional(),
  convex: z.object({
    deploymentUrl: z.string().trim().min(1).optional(),
    requestTimeoutMs: z.number().finite().positive().optional(),
  }).passthrough().optional(),
  ui: z.object({
    timezone: z.string().trim().min(1).optional(),
  }).passthrough().optional(),
}).passthrough();

export const isValidIanaTimezone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const normalizeUiTimezone = (value: string | null | undefined): string => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed && isValidIanaTimezone(trimmed)) {
    return trimmed;
  }
  return DEFAULT_UI_TIMEZONE;
};

export type RuntimeSettings = z.infer<typeof RuntimeSettingsSchema>;

const dedupeNonEmptyStrings = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
};

export const getModelChoices = (
  settings: RuntimeSettings | null,
): readonly string[] => {
  const configuredChoices = settings?.ai?.modelChoices ?? [];
  return dedupeNonEmptyStrings([...configuredChoices, ...DEFAULT_MODEL_CHOICES]);
};
