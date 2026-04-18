import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  RuntimeWakeupConfig,
  RuntimeWakeupPromptDefinition,
  RuntimeWakeupPromptTarget,
  RuntimeWakeupScheduleEntry,
} from "@clog/types";
import { resolveRuntimeWakeupPath } from "../../../../tests/runtime-instance-template";
import type { ToolCapabilityGroup, ToolFamily, ToolSummary } from "../schema/tools";

const brainDir = fileURLToPath(new URL("./", import.meta.url));
const promptsDir = join(brainDir, "prompts");
const knowledgeDir = join(brainDir, "knowledge");
const integrationKnowledgePaths: Partial<Record<ToolFamily, string>> = {
  posthog: fileURLToPath(new URL("../integrations/posthog/knowledge.md", import.meta.url)),
};

const readMarkdown = (path: string): string => readFileSync(path, "utf-8").trim();
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf-8")) as T;

const readOptionalMarkdown = (path: string): string | null => {
  try {
    return readMarkdown(path);
  } catch {
    return null;
  }
};

const readMarkdownDirectory = (directory: string): string | null => {
  try {
    const entries = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    if (entries.length === 0) {
      return null;
    }

    return entries
      .map((entry) => readMarkdown(join(directory, entry)))
      .filter(Boolean)
      .join("\n\n");
  } catch {
    return null;
  }
};

const readKnowledgePrompt = (): string | null => readMarkdownDirectory(knowledgeDir);

const readIntegrationKnowledgePrompts = (): Partial<Record<ToolFamily, string>> => {
  const prompts: Partial<Record<ToolFamily, string>> = {};

  for (const family of Object.keys(integrationKnowledgePaths) as ToolFamily[]) {
    const path = integrationKnowledgePaths[family];
    const content = path ? readOptionalMarkdown(path) : null;
    if (content) {
      prompts[family] = content;
    }
  }

  return prompts;
};

export interface AiPromptBundle {
  readonly systemPrompt: string;
  readonly projectPrompt: string | null;
  readonly knowledgePrompt: string | null;
  readonly integrationKnowledgePrompts: Partial<Record<ToolFamily, string>>;
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

const WAKEUP_TIME_UTC_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const normalizeWakeupPromptTarget = (value: unknown): RuntimeWakeupPromptTarget | null => {
  if (!value || typeof value !== "object") {
    return {
      channel: "system",
    };
  }

  const candidate = value as Partial<RuntimeWakeupPromptTarget>;
  if (candidate.channel && candidate.channel !== "system") {
    return null;
  }

  const threadTitle = typeof candidate.threadTitle === "string" ? candidate.threadTitle.trim() : "";
  return {
    channel: "system",
    ...(threadTitle ? { threadTitle } : {}),
  };
};

const normalizeWakeupPromptDefinition = (value: unknown): RuntimeWakeupPromptDefinition | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    readonly prompt?: unknown;
    readonly message?: unknown;
    readonly target?: unknown;
  };
  const promptSource = typeof candidate.prompt === "string"
    ? candidate.prompt
    : typeof candidate.message === "string"
      ? candidate.message
      : "";
  const prompt = promptSource.trim();
  const target = normalizeWakeupPromptTarget(candidate.target);

  if (!prompt || !target) {
    return null;
  }

  return {
    prompt,
    target,
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
    readonly prompts?: unknown;
    readonly schedule?: unknown;
  };

  if (!candidate.prompts || typeof candidate.prompts !== "object" || Array.isArray(candidate.prompts)) {
    return null;
  }

  const prompts = Object.entries(candidate.prompts as Record<string, unknown>).reduce<Record<string, RuntimeWakeupPromptDefinition>>(
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

  if (Object.keys(prompts).length === 0 || scheduleEntries.length === 0) {
    return null;
  }

  return {
    prompts,
    schedule: scheduleEntries,
  };
};

const readOptionalJson = <T>(path: string): T | null => {
  try {
    return readJson<T>(path);
  } catch {
    return null;
  }
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
    const promptDefinitions = Object.entries(runtimeWakeupConfig.prompts).map(([promptId, definition]) => {
      const threadTitle = definition.target.threadTitle
        ? `system thread "${definition.target.threadTitle}"`
        : "default system thread";
      return [
        `- ${promptId}:`,
        `  - Target: ${threadTitle}`,
        "  - Prompt:",
        ...definition.prompt.split("\n").map((line) => `    ${line}`),
      ].join("\n");
    });
    const scheduleEntries = runtimeWakeupConfig.schedule.map((entry) => `- ${entry.timeUtc} UTC -> ${entry.promptId}`);

    sections.push(
      [
        "Runtime wakeup config:",
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
  const integrationKnowledgePrompts = readIntegrationKnowledgePrompts();
  const sharedWakeupPrompt = readOptionalMarkdown(join(promptsDir, "wakeup.md"));
  const runtimeWakeupConfig = loadRuntimeWakeupConfig(env, workspaceRoot);

  return {
    systemPrompt: readMarkdown(join(promptsDir, "system.md")),
    projectPrompt,
    knowledgePrompt,
    integrationKnowledgePrompts,
    primaryModePrompt: readMarkdown(join(promptsDir, "modes", "primary.md")),
    wakeupPrompt: buildWakeupPrompt(sharedWakeupPrompt, runtimeWakeupConfig),
  };
};

const buildToolPrompt = (tools: readonly ToolSummary[]): string => {
  if (tools.length === 0) {
    return [
      "Tool access:",
      "- Advertised tools: 0",
      "- Advertised families: none",
      "- Capability groups: none",
      "- Approval required: no",
      "- Read deeper: use runtime knowledge or catalogs when you need more detail.",
    ].join("\n");
  }

  const familyOrder: readonly ToolFamily[] = [
    "posthog",
    "convex",
    "runtime",
    "notion",
    "shell",
    "github",
    "vercel",
  ];
  const familyCounts = new Map<ToolFamily, number>();
  const capabilityGroupCounts = new Map<ToolCapabilityGroup, number>();
  let approvalRequiredCount = 0;

  for (const tool of tools) {
    familyCounts.set(tool.integration, (familyCounts.get(tool.integration) ?? 0) + 1);
    capabilityGroupCounts.set(tool.capabilityGroup, (capabilityGroupCounts.get(tool.capabilityGroup) ?? 0) + 1);
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

  const capabilityGroupOrder: readonly ToolCapabilityGroup[] = [
    "workspace",
    "investigation",
    "release_safety",
    "analytics_buildout",
    "runtime_context",
    "runtime_read",
    "knowledge",
    "automation",
    "repository",
    "deployment",
    "shell",
    "orchestration",
  ];
  const capabilityGroupLabels: Record<ToolCapabilityGroup, string> = {
    workspace: "Workspace",
    investigation: "Investigation",
    release_safety: "Release Safety",
    analytics_buildout: "Analytics Buildout",
    runtime_context: "Runtime Context",
    runtime_read: "Runtime Read",
    knowledge: "Knowledge",
    automation: "Automation",
    repository: "Repository",
    deployment: "Deployment",
    shell: "Shell",
    orchestration: "Orchestration",
  };
  const enabledCapabilityGroups = capabilityGroupOrder
    .filter((group) => (capabilityGroupCounts.get(group) ?? 0) > 0)
    .map((group) => `${capabilityGroupLabels[group]} (${capabilityGroupCounts.get(group)})`);

  return [
    "Tool access:",
    `- Advertised tools: ${tools.length}`,
    `- Advertised families: ${enabledFamilies.join(", ")}`,
    `- Capability groups: ${enabledCapabilityGroups.join(", ")}`,
    `- Approval required: ${approvalRequiredCount > 0 ? "yes" : "no"}`,
    "- Start broad, then fan out: use `posthog_get_documented_tool_catalog` for grouped PostHog access and `runtime_get_info` for grouped runtime access.",
    "- Read deeper: use `runtime_search_messages` to narrow history and `runtime_get_conversation` with `nextRequest` to keep paging until you have enough context.",
  ].join("\n");
};

const buildKnowledgePrompt = (
  bundle: AiPromptBundle,
  tools: readonly ToolSummary[],
): string | null => {
  const sections: string[] = [];

  if (bundle.knowledgePrompt?.trim()) {
    sections.push(bundle.knowledgePrompt);
  }

  const enabledFamilies = new Set<ToolFamily>(tools.map((tool) => tool.integration));
  for (const family of enabledFamilies) {
    const knowledgePrompt = bundle.integrationKnowledgePrompts[family];
    if (knowledgePrompt?.trim()) {
      sections.push(knowledgePrompt);
    }
  }

  return sections.length > 0 ? sections.join("\n\n") : null;
};

export const buildSystemPrompt = (bundle: AiPromptBundle, options: SystemPromptOptions = {}): string => {
  const knowledgePrompt = options.includeKnowledgePrompt === false
    ? null
    : buildKnowledgePrompt(bundle, options.tools ?? []);

  return [
    bundle.systemPrompt,
    bundle.projectPrompt?.trim() ? `Project Context:\n${bundle.projectPrompt}` : "",
    knowledgePrompt?.trim() ? `Knowledge Context:\n${knowledgePrompt}` : "",
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
