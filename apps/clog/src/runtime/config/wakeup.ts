import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  RuntimeWakeupConfig,
  RuntimeWakeupPromptDefinition,
  RuntimeWakeupScheduleEntry,
} from "@clog/types";
import { getRuntimeProcessEnv } from "../config";
import { resolveRuntimeWakeupPath } from "../../../../../tests/runtime-instance-template";

const WAKEUP_TIME_UTC_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const readOptionalJson = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
};

const normalizeWakeupPromptDefinition = (value: unknown): RuntimeWakeupPromptDefinition | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    readonly title?: unknown;
    readonly prompt?: unknown;
  };
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const prompt = typeof candidate.prompt === "string" ? candidate.prompt.trim() : "";

  if (!title || !prompt) {
    return null;
  }

  return {
    title,
    prompt,
  };
};

export const parseRuntimeWakeupTimeUtc = (value: string): { readonly hour: number; readonly minute: number } | null => {
  const match = WAKEUP_TIME_UTC_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  return {
    hour: Number.parseInt(match[1]!, 10),
    minute: Number.parseInt(match[2]!, 10),
  };
};

const normalizeWakeupScheduleEntry = (
  value: unknown,
  prompts: Readonly<Record<string, RuntimeWakeupPromptDefinition>>,
): RuntimeWakeupScheduleEntry | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<RuntimeWakeupScheduleEntry>;
  const promptId = typeof candidate.promptId === "string" ? candidate.promptId.trim() : "";
  const timeUtc = typeof candidate.timeUtc === "string" ? candidate.timeUtc.trim() : "";

  if (!promptId || !prompts[promptId] || !parseRuntimeWakeupTimeUtc(timeUtc)) {
    return null;
  }

  return {
    promptId,
    timeUtc,
  };
};

export const normalizeRuntimeWakeupConfig = (value: unknown): RuntimeWakeupConfig | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as {
    readonly enabled?: unknown;
    readonly prompts?: unknown;
    readonly schedule?: unknown;
  };

  if (!candidate.prompts || typeof candidate.prompts !== "object" || Array.isArray(candidate.prompts)) {
    return null;
  }

  const rawPromptEntries = Object.entries(candidate.prompts as Record<string, unknown>);
  const rawScheduleEntries = Array.isArray(candidate.schedule) ? candidate.schedule : [];

  const prompts = rawPromptEntries.reduce<Record<string, RuntimeWakeupPromptDefinition>>(
    (accumulator, [rawPromptId, entry]) => {
      const promptId = rawPromptId.trim();
      const prompt = normalizeWakeupPromptDefinition(entry);
      if (!promptId || !prompt) {
        return accumulator;
      }

      accumulator[promptId] = prompt;
      return accumulator;
    },
    {},
  );

  const scheduleEntries = Array.isArray(candidate.schedule)
    ? candidate.schedule
        .map((entry) => normalizeWakeupScheduleEntry(entry, prompts))
        .filter((entry): entry is RuntimeWakeupScheduleEntry => entry !== null)
    : [];
  const hasContent = Object.keys(prompts).length > 0 && scheduleEntries.length > 0;
  const enabled = typeof candidate.enabled === "boolean" ? candidate.enabled : hasContent;

  if (rawPromptEntries.length === 0 && rawScheduleEntries.length === 0) {
    return {
      enabled,
      prompts: {},
      schedule: [],
    };
  }

  if (Object.keys(prompts).length === 0 || scheduleEntries.length === 0) {
    return null;
  }

  return {
    enabled,
    prompts,
    schedule: scheduleEntries,
  };
};

export const buildRuntimeWakeupPrompt = (
  sharedWakeupPrompt: string | null,
  runtimeWakeupConfig: RuntimeWakeupConfig | null,
): string | null => {
  if (!sharedWakeupPrompt && !runtimeWakeupConfig) {
    return null;
  }

  const sections: string[] = [];

  if (sharedWakeupPrompt) {
    sections.push(sharedWakeupPrompt);
  }

  if (runtimeWakeupConfig) {
    if (Object.keys(runtimeWakeupConfig.prompts).length === 0 && runtimeWakeupConfig.schedule.length === 0) {
      return sections.join("\n\n");
    }

    const promptDefinitions = Object.entries(runtimeWakeupConfig.prompts).map(([promptId, definition]) => {
      return [
        `- ${promptId}:`,
        `  - Title: ${definition.title}`,
        "  - Prompt:",
        ...definition.prompt.split("\n").map((line) => `    ${line}`),
      ].join("\n");
    });
    const scheduleEntries = runtimeWakeupConfig.schedule.map((entry) => `- ${entry.timeUtc} UTC -> ${entry.promptId}`);

    sections.push(
      [
        "Runtime wakeup config:",
        `- Enabled: ${runtimeWakeupConfig.enabled ? "yes" : "no"}`,
        "- Prompt definitions:",
        ...promptDefinitions,
        "- Daily UTC schedule:",
        ...scheduleEntries,
      ].join("\n"),
    );
  }

  return sections.join("\n\n");
};

export const resolveRuntimeWakeupConfigPath = (
  env: NodeJS.ProcessEnv = getRuntimeProcessEnv(),
  workspaceRoot = process.cwd(),
): string => {
  return resolveRuntimeWakeupPath(env, workspaceRoot);
};

export const resolveRuntimeWakeupStoragePath = (readOnlyDir: string): string => {
  return join(readOnlyDir, "wakeup.json");
};

export const loadRuntimeWakeupConfig = (
  env: NodeJS.ProcessEnv = getRuntimeProcessEnv(),
  workspaceRoot = process.cwd(),
): RuntimeWakeupConfig | null => {
  return normalizeRuntimeWakeupConfig(
    readOptionalJson<unknown>(resolveRuntimeWakeupConfigPath(env, workspaceRoot)),
  );
};

export const loadRuntimeWakeupPrompt = (
  sharedWakeupPrompt: string | null,
  env: NodeJS.ProcessEnv = getRuntimeProcessEnv(),
  workspaceRoot = process.cwd(),
): string | null => {
  return buildRuntimeWakeupPrompt(sharedWakeupPrompt, loadRuntimeWakeupConfig(env, workspaceRoot));
};
