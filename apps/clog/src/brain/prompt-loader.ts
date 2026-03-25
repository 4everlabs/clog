import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const brainDir = fileURLToPath(new URL("./", import.meta.url));
const promptsDir = join(brainDir, "prompts");

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
}

export const loadAiPromptBundle = (): AiPromptBundle => {
  return {
    systemPrompt: readMarkdown(join(promptsDir, "system.md")),
    primaryModePrompt: readMarkdown(join(promptsDir, "modes", "primary.md")),
    wakeupPrompt: readOptionalMarkdown(join(promptsDir, "wakeup.md")),
  };
};

export const buildSystemPrompt = (bundle: AiPromptBundle): string => {
  return bundle.systemPrompt;
};
