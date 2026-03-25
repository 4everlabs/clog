import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRuntimeWakeupPath } from "../../../../tests/runtime-instance-template";
import type { ToolSummary } from "../schema/tools";

const brainDir = fileURLToPath(new URL("./", import.meta.url));
const promptsDir = join(brainDir, "prompts");

const readMarkdown = (path: string): string => readFileSync(path, "utf-8").trim();
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf-8")) as T;

const readOptionalMarkdown = (path: string): string | null => {
  try {
    return readMarkdown(path);
  } catch {
    return null;
  }
};

export interface AiPromptBundle {
  readonly systemPrompt: string;
  readonly primaryModePrompt: string;
  readonly wakeupPrompt: string | null;
}

interface RuntimeWakeupConfig {
  readonly intervalMs: number;
  readonly message: string;
}

const normalizeRuntimeWakeupConfig = (value: unknown): RuntimeWakeupConfig | null => {
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

export const loadAiPromptBundle = (
  env: NodeJS.ProcessEnv = process.env,
  workspaceRoot = process.cwd(),
): AiPromptBundle => {
  const sharedWakeupPrompt = readOptionalMarkdown(join(promptsDir, "wakeup.md"));
  const runtimeWakeupConfig = normalizeRuntimeWakeupConfig(
    readOptionalJson<unknown>(resolveRuntimeWakeupConfigPath(env, workspaceRoot)),
  );

  return {
    systemPrompt: readMarkdown(join(promptsDir, "system.md")),
    primaryModePrompt: readMarkdown(join(promptsDir, "modes", "primary.md")),
    wakeupPrompt: buildWakeupPrompt(sharedWakeupPrompt, runtimeWakeupConfig),
  };
};

const buildToolPrompt = (tools: readonly ToolSummary[]): string => {
  if (tools.length === 0) {
    return [
      "Enabled tools for this turn:",
      "- No runtime tools are enabled right now.",
      "- Do not claim tool access that was not explicitly provided in the runtime payload.",
    ].join("\n");
  }

  const lines = ["Enabled tools for this turn:"];
  for (const tool of tools) {
    lines.push(`- ${tool.name}: ${tool.description}${tool.approvalRequired ? " Approval is required before risky actions." : ""}`);
  }

  return lines.join("\n");
};

export const buildSystemPrompt = (bundle: AiPromptBundle, tools: readonly ToolSummary[] = []): string => {
  return [
    bundle.systemPrompt,
    buildToolPrompt(tools),
  ].join("\n\n");
};
