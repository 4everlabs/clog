import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import type { RuntimeStorageConfig } from "./config";
import {
  POSTHOG_PERFORMANCE_REPORT_DIRECTORY_NAME,
} from "../ai/integrations/posthog/performance-reporter";
import {
  POSTHOG_WORKSPACE_SNAPSHOT_FILE_NAME,
} from "../ai/integrations/posthog/workspace-reporter";
import type { SurfaceChannelKind } from "@clog/types";
import type { RuntimeStore } from "../storage/chat";
import { resolveSinceTimestamp } from "../ai/tools/time-range";

const DEFAULT_THREAD_LIMIT = 3;
const DEFAULT_MESSAGE_LIMIT = 6;
const DEFAULT_FINDING_LIMIT = 5;
const DEFAULT_MEMORY_LIMIT = 5;
const DEFAULT_ACTION_RESULT_LIMIT = 5;
const DEFAULT_LOG_FILE_LIMIT = 2;
const DEFAULT_LOG_LINE_LIMIT = 80;
const DEFAULT_KNOWLEDGE_MAX_CHARS = 8_000;
const DEFAULT_JSON_MAX_CHARS = 12_000;
const DEFAULT_JSON_CHILD_KEY_LIMIT = 100;
const DEFAULT_MONITORING_REPORT_LIMIT = 3;
const DEFAULT_MONITORING_OPERATION_HISTORY_LIMIT = 4;
const DEFAULT_CONVERSATION_LIST_LIMIT = 50;
const DEFAULT_CONVERSATION_MESSAGE_LIMIT = 100;
const DEFAULT_CONVERSATION_TOKEN_BUDGET = 3_000;
const DEFAULT_MESSAGE_SEARCH_LIMIT = 30;
const MESSAGE_SNIPPET_MAX_CHARS = 280;
const APPROX_CHARS_PER_TOKEN = 4;
const WORKSPACE_PREFIX = "workspace/";
const WORKSPACE_TEXT_EXTENSIONS = new Set([".md", ".txt", ".text", ".log", ".yaml", ".yml"]);

const readTextIfExists = (path: string): string | null => {
  if (!existsSync(path)) {
    return null;
  }

  return readFileSync(path, "utf-8");
};

const readOptionalJson = <T>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
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

const isWithinRoot = (candidate: string, root: string): boolean => {
  const normalizedCandidate = resolve(candidate);
  const normalizedRoot = resolve(root);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
};

const getJsonValueType = (value: unknown): "object" | "array" | "string" | "number" | "boolean" | "null" => {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    default:
      return "object";
  }
};

const getJsonChildKeys = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.slice(0, DEFAULT_JSON_CHILD_KEY_LIMIT).map((_, index) => String(index));
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).slice(0, DEFAULT_JSON_CHILD_KEY_LIMIT);
  }

  return [];
};

const getJsonChildCount = (value: unknown): number | null => {
  if (Array.isArray(value)) {
    return value.length;
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length;
  }

  return null;
};

export interface RuntimeReadServiceConfig {
  readonly storage: RuntimeStorageConfig;
  readonly store: RuntimeStore;
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

export interface RuntimeReadJsonInput {
  readonly path: string;
  readonly fieldPath?: string;
  readonly maxChars?: number;
}

export interface RuntimeMonitoringSnapshotInput {
  readonly reportLimit?: number;
  readonly operationHistoryLimit?: number;
}

export interface RuntimeListConversationsInput {
  readonly limit?: number;
  readonly channel?: SurfaceChannelKind;
  readonly titleContains?: string;
  readonly timePreset?: "last_hour" | "last_12_hours" | "last_24_hours";
  readonly windowMinutes?: number;
}

export interface RuntimeGetConversationInput {
  readonly threadId: string;
  readonly messageOffset?: number;
  readonly messageLimit?: number;
  readonly tokenBudget?: number;
  readonly timePreset?: "last_hour" | "last_12_hours" | "last_24_hours";
  readonly windowMinutes?: number;
}

export interface RuntimeSearchMessagesInput {
  readonly query: string;
  readonly threadId?: string;
  readonly channel?: SurfaceChannelKind;
  readonly limit?: number;
  readonly caseSensitive?: boolean;
  readonly timePreset?: "last_hour" | "last_12_hours" | "last_24_hours";
  readonly windowMinutes?: number;
}

interface WorkspaceOperationHistoryEntry {
  readonly recordedAt: number;
  readonly data?: unknown;
}

interface RuntimeLogFileDescriptor {
  readonly fileName: string;
  readonly relativePath: string;
  readonly fullPath: string;
  readonly sortKey: string;
}

interface WorkspaceOperationSnapshot {
  readonly lastRecordedAt: number;
  readonly history: readonly WorkspaceOperationHistoryEntry[];
}

interface WorkspaceMonitoringSnapshot {
  readonly updatedAt?: number;
  readonly operations?: Record<string, WorkspaceOperationSnapshot>;
}

export class RuntimeReadService {
  private readonly store: RuntimeStore;
  private readonly storage: RuntimeStorageConfig;

  constructor(config: RuntimeReadServiceConfig) {
    this.store = config.store;
    this.storage = config.storage;
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
          ...(message.reasoning ? { reasoning: message.reasoning } : {}),
          ...(message.thoughts?.length ? { thoughts: message.thoughts } : {}),
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
    const pathContains = input.pathContains?.trim().toLowerCase() ?? "";
    const files = [
      ...this.listSessionLogFiles(),
      ...this.listLegacyLogFiles(),
    ]
      .filter((file) => !pathContains || file.relativePath.toLowerCase().includes(pathContains))
      .sort((left, right) => right.sortKey.localeCompare(left.sortKey))
      .slice(0, fileLimit);

    return {
      generatedAt: Date.now(),
      files: files.map((file) => {
        const fileContent = readTextIfExists(file.fullPath) ?? "";
        const tailed = tailLines(fileContent, lineLimit);
        return {
          fileName: file.fileName,
          relativePath: file.relativePath.replaceAll(sep, "/"),
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
    const normalizedSelectedPath = selectedPath ? this.normalizeWorkspaceDisplayPath(selectedPath) : null;

    if (!normalizedSelectedPath) {
      return {
        availablePaths,
        selectedPath: null,
        content: null,
        truncated: false,
      };
    }

    const resolvedPath = this.resolveKnowledgePath(normalizedSelectedPath, availablePaths);
    const content = readTextIfExists(resolvedPath);
    if (content === null) {
      throw new Error(`Workspace text path not found: ${normalizedSelectedPath}`);
    }

    const truncatedContent = truncateContent(content, maxChars);
    return {
      availablePaths,
      selectedPath: normalizedSelectedPath,
      content: truncatedContent.content,
      truncated: truncatedContent.truncated,
    };
  }

  readJson(input: RuntimeReadJsonInput) {
    const maxChars = clamp(input.maxChars, DEFAULT_JSON_MAX_CHARS, 50_000);
    const requestedPath = input.path.trim();
    if (!requestedPath) {
      throw new Error("JSON path is required");
    }

    const normalizedPath = this.normalizeWorkspaceDisplayPath(requestedPath);
    const resolvedPath = this.resolveWorkspaceAbsolutePath(normalizedPath);

    if (extname(resolvedPath).toLowerCase() !== ".json") {
      throw new Error(`JSON path must point to a .json file. Received: ${normalizedPath}`);
    }

    const rawContent = readTextIfExists(resolvedPath);
    if (rawContent === null) {
      throw new Error(`JSON path not found: ${normalizedPath}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent) as unknown;
    } catch {
      throw new Error(`JSON file could not be parsed: ${requestedPath}`);
    }

    const fieldPath = input.fieldPath?.trim() || null;
    const selectedValue = this.selectJsonValue(parsed, fieldPath);
    const serialized = JSON.stringify(selectedValue, null, 2);
    const truncatedContent = truncateContent(serialized, maxChars);
    const childKeys = getJsonChildKeys(selectedValue);

    return {
      path: normalizedPath,
      fieldPath,
      valueType: getJsonValueType(selectedValue),
      childKeys,
      childCount: getJsonChildCount(selectedValue),
      ...(truncatedContent.truncated
        ? { preview: truncatedContent.content }
        : { value: selectedValue }),
      truncated: truncatedContent.truncated,
    };
  }

  writeWorkspaceFile(input: { readonly path: string; readonly content: string }) {
    const normalizedPath = this.normalizeWorkspaceDisplayPath(input.path);
    const resolvedPath = this.resolveWorkspaceAbsolutePath(normalizedPath);
    const created = !existsSync(resolvedPath);
    mkdirSync(dirname(resolvedPath), { recursive: true });
    writeFileSync(resolvedPath, input.content, "utf-8");

    return {
      path: normalizedPath,
      created,
      bytesWritten: Buffer.byteLength(input.content, "utf-8"),
    };
  }

  listConversations(input: RuntimeListConversationsInput = {}) {
    const limit = clamp(input.limit, DEFAULT_CONVERSATION_LIST_LIMIT, 100);
    const titleNeedle = input.titleContains?.trim().toLowerCase() ?? "";
    const now = Date.now();
    const sinceTimestamp = resolveSinceTimestamp(now, input.timePreset, input.windowMinutes);
    let threads = this.store.listThreads();
    if (input.channel) {
      threads = threads.filter((thread) => thread.channel === input.channel);
    }

    if (sinceTimestamp !== null) {
      threads = threads.filter((thread) => thread.updatedAt >= sinceTimestamp);
    }

    if (titleNeedle.length > 0) {
      threads = threads.filter((thread) => thread.title.toLowerCase().includes(titleNeedle));
    }

    return {
      generatedAt: Date.now(),
      conversations: threads.slice(0, limit).map((thread) => ({
        id: thread.id,
        title: thread.title,
        channel: thread.channel,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        messageCount: thread.messages.length,
      })),
    };
  }

  getConversation(input: RuntimeGetConversationInput) {
    const thread = this.store.getThread(input.threadId.trim());
    if (!thread) {
      throw new Error(`Conversation not found: ${input.threadId}`);
    }

    const sinceTimestamp = resolveSinceTimestamp(Date.now(), input.timePreset, input.windowMinutes);
    const filteredMessages = sinceTimestamp === null
      ? thread.messages
      : thread.messages.filter((message) => message.createdAt >= sinceTimestamp);
    const totalMessages = filteredMessages.length;
    const messageOffset = Math.max(0, Math.trunc(input.messageOffset ?? 0));
    const messageLimit = clamp(input.messageLimit, DEFAULT_CONVERSATION_MESSAGE_LIMIT, 500);
    const tokenBudget = clamp(input.tokenBudget, DEFAULT_CONVERSATION_TOKEN_BUDGET, 20_000);
    const slice: Array<(typeof filteredMessages)[number]> = [];
    let returnedTokenEstimate = 0;

    for (const message of filteredMessages.slice(messageOffset)) {
      if (slice.length >= messageLimit) {
        break;
      }

      const estimatedTokens = this.estimateConversationMessageTokens(message.content, message.role);
      if (slice.length > 0 && returnedTokenEstimate + estimatedTokens > tokenBudget) {
        break;
      }

      slice.push(message);
      returnedTokenEstimate += estimatedTokens;
    }

    if (slice.length === 0 && filteredMessages[messageOffset]) {
      const firstMessage = filteredMessages[messageOffset]!;
      slice.push(firstMessage);
      returnedTokenEstimate = this.estimateConversationMessageTokens(firstMessage.content, firstMessage.role);
    }

    const nextMessageOffset = messageOffset + slice.length < totalMessages
      ? messageOffset + slice.length
      : null;
    const remainingMessages = nextMessageOffset === null ? 0 : totalMessages - nextMessageOffset;
    const nextRequest = nextMessageOffset === null
      ? null
      : {
          toolName: "runtime_get_conversation" as const,
          arguments: {
            threadId: thread.id,
            messageOffset: nextMessageOffset,
            tokenBudget,
            ...(input.timePreset ? { timePreset: input.timePreset } : {}),
            ...(!input.timePreset && typeof input.windowMinutes === "number" && Number.isFinite(input.windowMinutes)
              ? { windowMinutes: Math.trunc(input.windowMinutes) }
              : {}),
          },
        };
    const continuationHint = nextMessageOffset === null
      ? null
      : this.buildConversationContinuationHint({
          threadId: thread.id,
          nextMessageOffset,
          tokenBudget,
          timePreset: input.timePreset,
          windowMinutes: input.windowMinutes,
        });

    return {
      generatedAt: Date.now(),
      thread: {
        id: thread.id,
        title: thread.title,
        channel: thread.channel,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      },
      messages: slice.map((message) => ({
        id: message.id,
        role: message.role,
        channel: message.channel,
        content: message.content,
        ...(message.reasoning ? { reasoning: message.reasoning } : {}),
        ...(message.thoughts?.length ? { thoughts: message.thoughts } : {}),
        createdAt: message.createdAt,
      })),
      totalMessages,
      messageOffset,
      messageLimit,
      tokenBudget,
      returnedTokenEstimate,
      hasMoreMessages: nextMessageOffset !== null,
      nextMessageOffset,
      remainingMessages,
      nextRequest,
      continuationHint,
    };
  }

  searchMessages(input: RuntimeSearchMessagesInput) {
    const limit = clamp(input.limit, DEFAULT_MESSAGE_SEARCH_LIMIT, 100);
    const queryRaw = input.query.trim();
    const caseSensitive = Boolean(input.caseSensitive);
    const needle = caseSensitive ? queryRaw : queryRaw.toLowerCase();
    const sinceTimestamp = resolveSinceTimestamp(Date.now(), input.timePreset, input.windowMinutes);

    const threads = input.threadId
      ? [this.store.getThread(input.threadId.trim())].filter((thread): thread is NonNullable<typeof thread> => Boolean(thread))
      : this.store.listThreads();

    const filteredThreads = input.channel
      ? threads.filter((thread) => thread.channel === input.channel)
      : threads;

    const matches: Array<{
      threadId: string;
      threadTitle: string;
      channel: SurfaceChannelKind;
      messageId: string;
      role: "system" | "user" | "agent";
      createdAt: number;
      contentSnippet: string;
    }> = [];

    let truncated = false;

    outer: for (const thread of filteredThreads) {
      for (const message of thread.messages) {
        if (sinceTimestamp !== null && message.createdAt < sinceTimestamp) {
          continue;
        }

        const haystack = caseSensitive ? message.content : message.content.toLowerCase();
        if (!haystack.includes(needle)) {
          continue;
        }

        const snippet = message.content.length <= MESSAGE_SNIPPET_MAX_CHARS
          ? (message.content.length > 0 ? message.content : "(empty)")
          : `${message.content.slice(0, MESSAGE_SNIPPET_MAX_CHARS)}…`;

        matches.push({
          threadId: thread.id,
          threadTitle: thread.title,
          channel: thread.channel,
          messageId: message.id,
          role: message.role,
          createdAt: message.createdAt,
          contentSnippet: snippet,
        });

        if (matches.length >= limit) {
          truncated = true;
          break outer;
        }
      }
    }

    return {
      generatedAt: Date.now(),
      matches,
      truncated,
    };
  }

  getMonitoringSnapshot(input: RuntimeMonitoringSnapshotInput = {}) {
    const reportLimit = clamp(input.reportLimit, DEFAULT_MONITORING_REPORT_LIMIT, 10);
    const operationHistoryLimit = clamp(
      input.operationHistoryLimit,
      DEFAULT_MONITORING_OPERATION_HISTORY_LIMIT,
      20,
    );
    const workspaceSnapshotPath = join(this.storage.workspaceDir, POSTHOG_WORKSPACE_SNAPSHOT_FILE_NAME);
    const performanceReportsDir = join(this.storage.workspaceDir, POSTHOG_PERFORMANCE_REPORT_DIRECTORY_NAME);
    const workspaceSnapshot = readOptionalJson<WorkspaceMonitoringSnapshot>(workspaceSnapshotPath);
    const recentPostHogOperations = Object.entries(workspaceSnapshot?.operations ?? {})
      .flatMap(([operation, snapshot]) => {
        if (!Array.isArray(snapshot.history) || typeof snapshot.lastRecordedAt !== "number") {
          return [];
        }

        const history = snapshot.history
          .filter((entry): entry is WorkspaceOperationHistoryEntry => typeof entry?.recordedAt === "number")
          .map((entry) => ({
            recordedAt: entry.recordedAt,
            data: entry.data,
          }));

        return [{
          operation,
          lastRecordedAt: snapshot.lastRecordedAt,
          history: history.slice(-operationHistoryLimit).reverse(),
        }];
      })
      .sort((left, right) => right.lastRecordedAt - left.lastRecordedAt);
    const recentPerformanceReports = existsSync(performanceReportsDir)
      ? readdirSync(performanceReportsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => {
          const path = join(performanceReportsDir, entry.name);
          const parsed = readOptionalJson<Record<string, unknown>>(path) ?? {};
          return {
            fileName: entry.name,
            createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : 0,
            report: parsed,
          };
        })
        .sort((left, right) => right.createdAt - left.createdAt || right.fileName.localeCompare(left.fileName))
        .slice(0, reportLimit)
      : [];

    return {
      generatedAt: Date.now(),
      latestPerformanceReport: recentPerformanceReports[0]?.report ?? null,
      recentPerformanceReports,
      recentPostHogOperations,
    };
  }

  private listSessionLogFiles(): RuntimeLogFileDescriptor[] {
    const sessionsDir = join(this.storage.storageDir, "sessions");
    if (!existsSync(sessionsDir)) {
      return [];
    }

    const entries = readdirSync(sessionsDir, { withFileTypes: true });
    const rootFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
      .map((entry) => ({
        fileName: entry.name,
        relativePath: join("sessions", entry.name),
        fullPath: join(sessionsDir, entry.name),
        sortKey: `0000-root/${entry.name}`,
      }));
    const nestedSessionFiles = entries
      .filter((entry) => entry.isDirectory())
      .flatMap((sessionEntry) => {
        const sessionDirPath = join(sessionsDir, sessionEntry.name);
        return readdirSync(sessionDirPath, { withFileTypes: true })
          .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
          .map((entry) => ({
            fileName: entry.name,
            relativePath: join("sessions", sessionEntry.name, entry.name),
            fullPath: join(sessionDirPath, entry.name),
            sortKey: `${sessionEntry.name}/${entry.name}`,
          }));
      });

    return [
      ...nestedSessionFiles,
      ...rootFiles,
    ];
  }

  private listLegacyLogFiles(): RuntimeLogFileDescriptor[] {
    const logsDir = join(this.storage.storageDir, "logs");
    if (!existsSync(logsDir)) {
      return [];
    }

    return readdirSync(logsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
      .map((entry) => ({
        fileName: entry.name,
        relativePath: join("logs", entry.name),
        fullPath: join(logsDir, entry.name),
        sortKey: entry.name,
      }));
  }

  private listKnowledgePaths(): string[] {
    const paths = this.listWorkspaceTextPaths(this.storage.workspaceDir);
    return paths.sort((left, right) => left.localeCompare(right));
  }

  private resolveKnowledgePath(path: string, availablePaths: readonly string[]): string {
    if (!availablePaths.includes(path)) {
      throw new Error(`Unknown knowledge path "${path}". Available paths: ${availablePaths.join(", ")}`);
    }

    return this.resolveWorkspaceAbsolutePath(path);
  }

  private normalizeWorkspaceDisplayPath(path: string): string {
    const trimmed = path.trim().replaceAll("\\", "/");
    const relativePath = trimmed.replace(/^workspace\//u, "").replace(/^\/+/u, "");
    if (!relativePath) {
      throw new Error("Workspace path is required");
    }

    return `${WORKSPACE_PREFIX}${relativePath}`;
  }

  private resolveWorkspaceAbsolutePath(path: string): string {
    const relativePath = path.replace(/^workspace\//u, "");
    const resolvedPath = resolve(this.storage.workspaceDir, relativePath);
    if (!isWithinRoot(resolvedPath, this.storage.workspaceDir)) {
      throw new Error(`Workspace path must stay inside ${this.storage.workspaceDir}`);
    }

    return resolvedPath;
  }

  private listWorkspaceTextPaths(root: string, prefix = ""): string[] {
    if (!existsSync(root)) {
      return [];
    }

    const currentDir = prefix ? join(root, prefix) : root;
    return readdirSync(currentDir, { withFileTypes: true }).flatMap((entry) => {
      const relativePath = prefix ? join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        return this.listWorkspaceTextPaths(root, relativePath);
      }

      if (!entry.isFile()) {
        return [];
      }

      const extension = extname(entry.name).toLowerCase();
      if (!WORKSPACE_TEXT_EXTENSIONS.has(extension)) {
        return [];
      }

      return [`${WORKSPACE_PREFIX}${relativePath.replaceAll(sep, "/")}`];
    });
  }

  private selectJsonValue(value: unknown, fieldPath: string | null): unknown {
    if (!fieldPath) {
      return value;
    }

    let current = value;
    for (const segment of fieldPath.split(".").map((entry) => entry.trim()).filter(Boolean)) {
      if (Array.isArray(current)) {
        const index = Number.parseInt(segment, 10);
        if (!Number.isInteger(index) || index < 0 || index >= current.length) {
          throw new Error(`Field path "${fieldPath}" is invalid at array segment "${segment}"`);
        }
        current = current[index];
        continue;
      }

      if (current && typeof current === "object" && segment in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[segment];
        continue;
      }

      throw new Error(`Field path "${fieldPath}" is invalid at segment "${segment}"`);
    }

    return current;
  }

  private estimateConversationMessageTokens(
    content: string,
    role: "system" | "user" | "agent",
  ): number {
    return Math.max(1, Math.ceil(content.length / APPROX_CHARS_PER_TOKEN) + role.length + 6);
  }

  private buildConversationContinuationHint(input: {
    readonly threadId: string;
    readonly nextMessageOffset: number;
    readonly tokenBudget: number;
    readonly timePreset?: "last_hour" | "last_12_hours" | "last_24_hours";
    readonly windowMinutes?: number;
  }): string {
    const parts = [
      `Call runtime_get_conversation with threadId="${input.threadId}"`,
      `messageOffset=${input.nextMessageOffset}`,
      `tokenBudget=${input.tokenBudget}`,
    ];

    if (input.timePreset) {
      parts.push(`timePreset="${input.timePreset}"`);
    } else if (typeof input.windowMinutes === "number" && Number.isFinite(input.windowMinutes)) {
      parts.push(`windowMinutes=${Math.trunc(input.windowMinutes)}`);
    }

    return `${parts.join(", ")} to read the next chunk.`;
  }
}
