import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeStorageConfig } from "../config";
import type { RuntimeStore } from "../storage/chat";

const DEFAULT_THREAD_LIMIT = 3;
const DEFAULT_MESSAGE_LIMIT = 6;
const DEFAULT_FINDING_LIMIT = 5;
const DEFAULT_MEMORY_LIMIT = 5;
const DEFAULT_ACTION_RESULT_LIMIT = 5;
const DEFAULT_LOG_FILE_LIMIT = 2;
const DEFAULT_LOG_LINE_LIMIT = 80;
const DEFAULT_KNOWLEDGE_MAX_CHARS = 8_000;

const readTextIfExists = (path: string): string | null => {
  if (!existsSync(path)) {
    return null;
  }

  return readFileSync(path, "utf-8");
};

const truncateContent = (content: string, maxChars: number): {
  readonly content: string;
  readonly truncated: boolean;
} => {
  if (content.length <= maxChars) {
    return {
      content,
      truncated: false,
    };
  }

  return {
    content: `${content.slice(0, maxChars)}\n\n[truncated]`,
    truncated: true,
  };
};

const tailLines = (content: string, lineLimit: number): {
  readonly content: string;
  readonly totalLines: number;
  readonly returnedLines: number;
  readonly truncated: boolean;
} => {
  const lines = content.split(/\r?\n/u);
  const meaningfulLines = lines.at(-1) === "" ? lines.slice(0, -1) : lines;
  const totalLines = meaningfulLines.length;
  const selectedLines = meaningfulLines.slice(-lineLimit);
  return {
    content: selectedLines.join("\n"),
    totalLines,
    returnedLines: selectedLines.length,
    truncated: selectedLines.length < totalLines,
  };
};

const clamp = (value: number | undefined, fallback: number, maximum: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(maximum, Math.trunc(value as number)));
};

const runtimeDir = fileURLToPath(new URL("../", import.meta.url));
const defaultKnowledgeDir = join(runtimeDir, "brain", "knowledge");

export interface RuntimeReadServiceConfig {
  readonly storage: RuntimeStorageConfig;
  readonly store: RuntimeStore;
  readonly knowledgeDir?: string;
  readonly wakeupPath?: string;
  readonly settingsPath?: string;
  readonly toolsPath?: string;
}

export interface RuntimeStateSnapshotInput {
  readonly threadLimit?: number;
  readonly messageLimitPerThread?: number;
  readonly findingLimit?: number;
  readonly memoryLimit?: number;
  readonly actionResultLimit?: number;
}

export interface RuntimeRecentLogsInput {
  readonly fileLimit?: number;
  readonly lineLimit?: number;
  readonly pathContains?: string;
}

export interface RuntimeReadKnowledgeInput {
  readonly path?: string;
  readonly maxChars?: number;
}

export class RuntimeReadService {
  private readonly store: RuntimeStore;
  private readonly storage: RuntimeStorageConfig;
  private readonly knowledgeDir: string;
  private readonly wakeupPath: string;
  private readonly settingsPath: string;
  private readonly toolsPath: string;

  constructor(config: RuntimeReadServiceConfig) {
    this.store = config.store;
    this.storage = config.storage;
    this.knowledgeDir = config.knowledgeDir ?? defaultKnowledgeDir;
    this.wakeupPath = config.wakeupPath ?? join(config.storage.instanceRoot, "wakeup.json");
    this.settingsPath = config.settingsPath ?? join(config.storage.readOnlyDir, "settings.json");
    this.toolsPath = config.toolsPath ?? join(config.storage.readOnlyDir, "tools.json");
  }

  getStateSnapshot(input: RuntimeStateSnapshotInput = {}) {
    const threadLimit = clamp(input.threadLimit, DEFAULT_THREAD_LIMIT, 20);
    const messageLimitPerThread = clamp(input.messageLimitPerThread, DEFAULT_MESSAGE_LIMIT, 50);
    const findingLimit = clamp(input.findingLimit, DEFAULT_FINDING_LIMIT, 20);
    const memoryLimit = clamp(input.memoryLimit, DEFAULT_MEMORY_LIMIT, 20);
    const actionResultLimit = clamp(input.actionResultLimit, DEFAULT_ACTION_RESULT_LIMIT, 20);
    const openFindings = this.store.listFindings().filter((finding) => finding.state === "open");
    const recentThreads = this.store.listThreads().slice(0, threadLimit);
    const recentMemories = [...this.store.listMemories()]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, memoryLimit);
    const recentActionResults = [...this.store.listActionResults()].slice(-actionResultLimit).reverse();

    return {
      generatedAt: Date.now(),
      status: this.store.getStatus(),
      openFindingsCount: openFindings.length,
      openFindings: openFindings.slice(0, findingLimit).map((finding) => ({
        id: finding.id,
        title: finding.title,
        severity: finding.severity,
        summary: finding.summary,
        lastSeenAt: finding.lastSeenAt,
      })),
      recentThreads: recentThreads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        channel: thread.channel,
        updatedAt: thread.updatedAt,
        messageCount: thread.messages.length,
        messages: thread.messages.slice(-messageLimitPerThread).map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        })),
      })),
      recentMemories: recentMemories.map((memory) => ({
        id: memory.id,
        type: memory.type,
        importance: memory.importance,
        content: memory.content,
        createdAt: memory.createdAt,
      })),
      recentActionResults: recentActionResults,
    };
  }

  getRecentLogs(input: RuntimeRecentLogsInput = {}) {
    const fileLimit = clamp(input.fileLimit, DEFAULT_LOG_FILE_LIMIT, 10);
    const lineLimit = clamp(input.lineLimit, DEFAULT_LOG_LINE_LIMIT, 400);
    const logsDir = join(this.storage.storageDir, "logs");
    const pathContains = input.pathContains?.trim().toLowerCase() ?? "";
    const files = existsSync(logsDir)
      ? readdirSync(logsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
        .map((entry) => entry.name)
        .filter((name) => !pathContains || name.toLowerCase().includes(pathContains))
        .sort((left, right) => right.localeCompare(left))
        .slice(0, fileLimit)
      : [];

    return {
      generatedAt: Date.now(),
      files: files.map((fileName) => {
        const relativePath = join("logs", fileName);
        const fullPath = join(logsDir, fileName);
        const fileContent = readTextIfExists(fullPath) ?? "";
        const tailed = tailLines(fileContent, lineLimit);
        return {
          fileName,
          relativePath,
          totalLines: tailed.totalLines,
          returnedLines: tailed.returnedLines,
          truncated: tailed.truncated,
          content: tailed.content,
        };
      }),
    };
  }

  readKnowledge(input: RuntimeReadKnowledgeInput = {}) {
    const maxChars = clamp(input.maxChars, DEFAULT_KNOWLEDGE_MAX_CHARS, 20_000);
    const availablePaths = this.listKnowledgePaths();
    const selectedPath = input.path?.trim() ?? null;

    if (!selectedPath) {
      return {
        availablePaths,
        selectedPath: null,
        content: null,
        truncated: false,
      };
    }

    const resolvedPath = this.resolveKnowledgePath(selectedPath, availablePaths);
    const content = readTextIfExists(resolvedPath);
    if (content === null) {
      throw new Error(`Knowledge path not found: ${selectedPath}`);
    }

    const truncatedContent = truncateContent(content, maxChars);
    return {
      availablePaths,
      selectedPath,
      content: truncatedContent.content,
      truncated: truncatedContent.truncated,
    };
  }

  private listKnowledgePaths(): string[] {
    const knowledgeFiles = existsSync(this.knowledgeDir)
      ? readdirSync(this.knowledgeDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => `knowledge/${entry.name}`)
      : [];

    return [
      ...knowledgeFiles.sort((left, right) => left.localeCompare(right)),
      "runtime/read-only/settings.json",
      "runtime/read-only/tools.json",
      "runtime/wakeup.json",
    ];
  }

  private resolveKnowledgePath(path: string, availablePaths: readonly string[]): string {
    if (!availablePaths.includes(path)) {
      throw new Error(`Unknown knowledge path "${path}". Available paths: ${availablePaths.join(", ")}`);
    }

    if (path.startsWith("knowledge/")) {
      return join(this.knowledgeDir, path.replace(/^knowledge\//u, ""));
    }

    if (path === "runtime/read-only/settings.json") {
      return this.settingsPath;
    }

    if (path === "runtime/read-only/tools.json") {
      return this.toolsPath;
    }

    return this.wakeupPath;
  }
}
