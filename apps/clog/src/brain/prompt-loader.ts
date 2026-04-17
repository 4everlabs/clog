import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeWakeupConfig } from "@clog/types";
import { resolveRuntimeWakeupPath } from "../../../../tests/runtime-instance-template";
import type { ToolFamily, ToolSummary } from "../schema/tools";

const brainDir = fileURLToPath(new URL("./", import.meta.url));
const promptsDir = join(brainDir, "prompts");
const knowledgeDir = join(brainDir, "knowledge");

const readMarkdown = (path: string): string => readFileSync(path, "utf-8").trim();
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf-8")) as T;

const readOptionalMarkdown = (path: string): string | null => {
  try {
    return readMarkdown(path);
  } catch {
    return null;
  }
};

const readKnowledgePrompt = (): string | null => {
  try {
    const entries = readdirSync(knowledgeDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    if (entries.length === 0) {
      return null;
    }

    return entries
      .map((entry) => readMarkdown(join(knowledgeDir, entry)))
      .filter(Boolean)
      .join("\n\n");
  } catch {
    return null;
  }
};

export interface AiPromptBundle {
  readonly systemPrompt: string;
  readonly projectPrompt: string | null;
  readonly knowledgePrompt: string | null;
  readonly primaryModePrompt: string;
  readonly wakeupPrompt: string | null;
}

export interface SystemPromptOptions {
  readonly tools?: readonly ToolSummary[];
  readonly includeModePrompt?: boolean;
  readonly includeKnowledgePrompt?: boolean;
  readonly executionMode?: string | null;
  readonly findingsSummary?: string | null;
  readonly runtimeContext?: string | null;
  readonly wakeupPrompt?: string | null;
}

export const normalizeRuntimeWakeupConfig = (value: unknown): RuntimeWakeupConfig | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<RuntimeWakeupConfig>;
  const intervalMs = typeof candidate.intervalMs === "number" && Number.isFinite(candidate.intervalMs)
    ? Math.max(1_000, candidate.intervalMs)
    : null;
  const message = typeof candidate.message === "string" ? candidate.message.trim() : "";

  if (!intervalMs || !message) {
    return null;
  }

  return {
    intervalMs,
    message,
  };
};

const readOptionalJson = <T>(path: string): T | null => {
  try {
    return readJson<T>(path);
  } catch {
    return null;
  }
};

const formatWakeupInterval = (intervalMs: number): string => {
  if (intervalMs % 60_000 === 0) {
    return `${intervalMs / 60_000} minute${intervalMs === 60_000 ? "" : "s"}`;
  }

  if (intervalMs % 1_000 === 0) {
    return `${intervalMs / 1_000} second${intervalMs === 1_000 ? "" : "s"}`;
  }

  return `${intervalMs}ms`;
};

const buildWakeupPrompt = (
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
    sections.push(
      [
        "Runtime wakeup config:",
        `- Frequency: every ${formatWakeupInterval(runtimeWakeupConfig.intervalMs)} (${runtimeWakeupConfig.intervalMs}ms)`,
        "- Operator message:",
        runtimeWakeupConfig.message,
      ].join("\n"),
    );
  }

  return sections.join("\n\n");
};

export const resolveRuntimeWakeupConfigPath = (
  env: NodeJS.ProcessEnv = process.env,
  workspaceRoot = process.cwd(),
): string => {
  return resolveRuntimeWakeupPath(env, workspaceRoot);
};

export const loadRuntimeWakeupConfig = (
  env: NodeJS.ProcessEnv = process.env,
  workspaceRoot = process.cwd(),
): RuntimeWakeupConfig | null => {
  return normalizeRuntimeWakeupConfig(
    readOptionalJson<unknown>(resolveRuntimeWakeupConfigPath(env, workspaceRoot)),
  );
};

export const loadAiPromptBundle = (
  env: NodeJS.ProcessEnv = process.env,
  workspaceRoot = process.cwd(),
): AiPromptBundle => {
  const projectPrompt = readOptionalMarkdown(join(promptsDir, "project.md"));
  const knowledgePrompt = readKnowledgePrompt();
  const sharedWakeupPrompt = readOptionalMarkdown(join(promptsDir, "wakeup.md"));
  const runtimeWakeupConfig = loadRuntimeWakeupConfig(env, workspaceRoot);

  return {
    systemPrompt: readMarkdown(join(promptsDir, "system.md")),
    projectPrompt,
    knowledgePrompt,
    primaryModePrompt: readMarkdown(join(promptsDir, "modes", "primary.md")),
    wakeupPrompt: buildWakeupPrompt(sharedWakeupPrompt, runtimeWakeupConfig),
  };
};

const buildToolPrompt = (tools: readonly ToolSummary[]): string => {
  if (tools.length === 0) {
    return [
      "Tool access:",
      "- Enabled tools: 0",
      "- Enabled families: none",
      "- Approval required: no",
      "- Read deeper: use runtime knowledge or catalogs when you need more detail.",
    ].join("\n");
  }

  const familyOrder: readonly ToolFamily[] = [
    "posthog",
    "runtime",
    "notion",
    "shell",
    "github",
    "vercel",
  ];
  const familyCounts = new Map<ToolFamily, number>();
  let approvalRequiredCount = 0;

  for (const tool of tools) {
    familyCounts.set(tool.integration, (familyCounts.get(tool.integration) ?? 0) + 1);
    if (tool.approvalRequired) {
      approvalRequiredCount += 1;
    }
  }

  const enabledFamilies = familyOrder
    .filter((family) => (familyCounts.get(family) ?? 0) > 0)
    .map((family) => {
      const label = family === "posthog"
        ? "PostHog"
        : family[0]!.toUpperCase() + family.slice(1);
      return `${label} (${familyCounts.get(family)})`;
    });

  return [
    "Tool access:",
    `- Enabled tools: ${tools.length}`,
    `- Enabled families: ${enabledFamilies.join(", ")}`,
    `- Approval required: ${approvalRequiredCount > 0 ? "yes" : "no"}`,
    "- Read deeper: use runtime knowledge or catalogs when you need more detail.",
  ].join("\n");
};

export const buildSystemPrompt = (bundle: AiPromptBundle, options: SystemPromptOptions = {}): string => {
  return [
    bundle.systemPrompt,
    bundle.projectPrompt?.trim() ? `Project Context:\n${bundle.projectPrompt}` : "",
    options.includeKnowledgePrompt === false || !bundle.knowledgePrompt?.trim()
      ? ""
      : `Knowledge Context:\n${bundle.knowledgePrompt}`,
    options.runtimeContext?.trim() ? `Runtime Context:\n${options.runtimeContext}` : "",
    options.includeModePrompt === false ? "" : bundle.primaryModePrompt,
    buildToolPrompt(options.tools ?? []),
    options.executionMode ? `Execution Mode: ${options.executionMode}` : "",
    options.findingsSummary?.trim() ? options.findingsSummary : "",
    options.wakeupPrompt?.trim() ? `Wakeup Guidance:\n${options.wakeupPrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
};
