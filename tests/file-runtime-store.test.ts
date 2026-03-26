import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ActionExecutionResult, AgentFinding } from "@clog/types";
import { FileRuntimeStore } from "../apps/clog/src/storage/file-runtime-store";

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (path) {
      rmSync(path, { recursive: true, force: true });
    }
  }
});

const createStorageConfig = (root: string) => ({
  instanceId: "test-instance",
  instanceRoot: root,
  readOnlyDir: join(root, "read-only"),
  workspaceDir: join(root, "workspace"),
  storageDir: join(root, "storage"),
  stateDir: join(root, "storage", "state"),
});

const createStore = () => {
  const root = mkdtempSync(join(tmpdir(), "clog-file-store-"));
  cleanupPaths.push(root);
  return new FileRuntimeStore(createStorageConfig(root));
};

const readJsonl = (path: string): readonly Record<string, unknown>[] => {
  const content = readFileSync(path, "utf-8").trim();
  if (!content) {
    return [];
  }

  return content.split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
};

const getConversationDirectoryForThread = (storageDir: string, threadId: string): string => {
  const conversationsDir = join(storageDir, "conversations");
  const directories = readdirSync(conversationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const matchingDirectory = directories.find((directory) => {
    const notesPath = join(conversationsDir, directory, "notes.jsonl");
    const notesEntries = readJsonl(notesPath);
    return notesEntries[0]?.threadId === threadId;
  });

  if (!matchingDirectory) {
    throw new Error(`Conversation directory not found for thread ${threadId}`);
  }

  return join(conversationsDir, matchingDirectory);
};

const sampleFinding: AgentFinding = {
  id: "finding_test",
  title: "Test finding",
  severity: "warning",
  state: "open",
  summary: "Test finding summary",
  details: "Test finding details",
  firstSeenAt: 1,
  lastSeenAt: 2,
  sources: [{ kind: "posthog", label: "PostHog" }],
  observations: [],
  proposedActions: [],
};

const sampleActionResult: ActionExecutionResult = {
  actionId: "action_test",
  state: "completed",
  summary: "Action completed.",
};

describe("FileRuntimeStore", () => {
  test("persists status, findings, threads, memories, and action results across store instances", () => {
    const store = createStore();
    store.setStatus("idle");
    store.upsertFindings([sampleFinding]);
    const thread = store.seedOperatorThread("telegram");
    const userMessage = store.createMessage("user", "telegram", "hello");
    store.appendMessages(thread.id, [userMessage]);
    store.addMemory({
      content: "Remember this finding",
      type: "finding",
      importance: 8,
      metadata: { findingId: sampleFinding.id },
    });
    store.rememberActionResult(sampleActionResult);
    store.close();

    expect(existsSync(join(store.config.stateDir, "threads.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(store.config.stateDir, "status.json"), "utf-8"))).toEqual({ status: "idle" });

    const reopened = new FileRuntimeStore(store.config);

    expect(reopened.getStatus()).toBe("idle");
    expect(reopened.listFindings()).toHaveLength(1);
    expect(reopened.listFindings()[0]?.title).toBe("Test finding");
    expect(reopened.listThreads()).toHaveLength(1);
    expect(reopened.listThreads()[0]?.messages.some((message) => message.content === "hello")).toBe(true);
    expect(reopened.listMemories()).toHaveLength(1);
    expect(reopened.getActionResult(sampleActionResult.actionId)).toEqual(sampleActionResult);
    reopened.close();
  });

  test("creates conversation folders with seeded notes and channel-specific chat logs", () => {
    const store = createStore();
    const cliThread = store.createThread("cli", "CLI thread");
    const cliUserMessage = store.createMessage("user", "cli", "hello from cli");
    store.appendMessages(cliThread.id, [cliUserMessage]);

    const telegramThread = store.seedOperatorThread("telegram");
    const telegramUserMessage = store.createMessage("user", "telegram", "hello from telegram");
    store.appendMessages(telegramThread.id, [telegramUserMessage]);
    store.close();

    const cliConversationDir = getConversationDirectoryForThread(store.config.storageDir, cliThread.id);
    const cliNotesEntries = readJsonl(join(cliConversationDir, "notes.jsonl"));
    const cliChatEntries = readJsonl(join(cliConversationDir, "chat.jsonl"));

    expect(cliNotesEntries[0]).toMatchObject({
      type: "conversation-header",
      fileKind: "notes",
      threadId: cliThread.id,
      channel: "cli",
      title: "CLI thread",
    });
    expect(cliChatEntries[0]).toMatchObject({
      type: "conversation-header",
      fileKind: "chat",
      threadId: cliThread.id,
    });
    expect(cliChatEntries.some((entry) => entry.type === "message" && entry.content === "hello from cli")).toBe(true);

    const telegramConversationDir = getConversationDirectoryForThread(store.config.storageDir, telegramThread.id);
    const telegramNotesEntries = readJsonl(join(telegramConversationDir, "notes.jsonl"));
    const telegramChatEntries = readJsonl(join(telegramConversationDir, "chat.jsonl"));

    expect(telegramNotesEntries[0]).toMatchObject({
      type: "conversation-header",
      fileKind: "notes",
      threadId: telegramThread.id,
      channel: "telegram",
    });
    expect(telegramChatEntries[0]).toMatchObject({
      type: "conversation-header",
      fileKind: "chat",
      threadId: telegramThread.id,
      channel: "telegram",
    });
    expect(telegramChatEntries.some((entry) => entry.type === "message" && entry.content === "hello from telegram")).toBe(true);
  });

  test("removes legacy runtime sqlite when the file store starts", () => {
    const root = mkdtempSync(join(tmpdir(), "clog-file-store-"));
    cleanupPaths.push(root);
    const config = createStorageConfig(root);
    const legacySqlitePath = join(config.storageDir, "runtime.sqlite");

    mkdirSync(config.storageDir, { recursive: true });
    writeFileSync(legacySqlitePath, "legacy sqlite placeholder", "utf-8");
    expect(existsSync(legacySqlitePath)).toBe(true);

    const store = new FileRuntimeStore(config);
    expect(existsSync(legacySqlitePath)).toBe(false);
    store.close();
  });
});
