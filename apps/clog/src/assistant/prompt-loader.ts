import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoPromptsDir = fileURLToPath(new URL("./prompts/", import.meta.url));

const trimToNull = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const readMarkdown = (path: string): string => readFileSync(path, "utf-8").trim();

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
  readonly projectPrompt: string | null;
}

export const resolveRuntimePromptsDir = (
  env: NodeJS.ProcessEnv = process.env,
  workspaceRoot = process.cwd(),
): string => {
  const instanceId = trimToNull(env.POSTHOG_CLAW_INSTANCE_ID) ?? "personal-instance";
  const instanceRoot = trimToNull(env.POSTHOG_CLAW_INSTANCE_ROOT)
    ? resolve(workspaceRoot, env.POSTHOG_CLAW_INSTANCE_ROOT!)
    : resolve(workspaceRoot, ".runtime", "instances", instanceId);

  return join(instanceRoot, "brain", "prompts");
};

export const loadAiPromptBundle = (
  env: NodeJS.ProcessEnv = process.env,
  workspaceRoot = process.cwd(),
): AiPromptBundle => {
  const runtimePromptsDir = resolveRuntimePromptsDir(env, workspaceRoot);

  return {
    systemPrompt: readMarkdown(join(repoPromptsDir, "system.md")),
    primaryModePrompt: readMarkdown(join(repoPromptsDir, "modes", "primary.md")),
    wakeupPrompt: readOptionalMarkdown(join(runtimePromptsDir, "wakeup.md")),
    projectPrompt: readOptionalMarkdown(join(runtimePromptsDir, "project.md")),
  };
};

export const buildSystemPrompt = (bundle: AiPromptBundle): string => {
  if (!bundle.projectPrompt) {
    return bundle.systemPrompt;
  }

  return `${bundle.systemPrompt}

## Instance Project Prompt

The following operator-owned project prompt is loaded from the runtime state for this specific instance. Treat it as private, instance-scoped context about the real app, goals, constraints, and operating priorities for this deployment.

${bundle.projectPrompt}`;
};
