import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
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
    const tuiThread = store.createThread("tui", "TUI thread");
    const tuiUserMessage = store.createMessage("user", "tui", "hello from tui");
    store.appendMessages(tuiThread.id, [tuiUserMessage]);

    const telegramThread = store.seedOperatorThread("telegram");
    const telegramUserMessage = store.createMessage("user", "telegram", "hello from telegram");
    const telegramReplyMessage = store.createMessage(
      "agent",
      "telegram",
      "hello from clog",
      "Checked the most recent thread context before replying.",
      [{
        stepNumber: 1,
        reasoning: "Checked the most recent thread context before replying.",
        toolCalls: [{
          toolCallId: "call_1",
          toolName: "runtime_get_conversation",
          input: "{\"threadId\":\"thread_1\"}",
        }],
        toolResults: [{
          toolCallId: "call_1",
          toolName: "runtime_get_conversation",
          output: "{\"messages\":[]}",
        }],
      }],
    );
    store.appendMessages(telegramThread.id, [telegramUserMessage, telegramReplyMessage]);
    store.close();

    const tuiConversationDir = getConversationDirectoryForThread(store.config.storageDir, tuiThread.id);
    const tuiNotesEntries = readJsonl(join(tuiConversationDir, "notes.jsonl"));
    const tuiChatEntries = readJsonl(join(tuiConversationDir, "chat.jsonl"));

    expect(tuiNotesEntries[0]).toMatchObject({
      type: "conversation-header",
      fileKind: "notes",
      threadId: tuiThread.id,
      channel: "tui",
      title: "TUI thread",
    });
    expect(tuiChatEntries[0]).toMatchObject({
      type: "conversation-header",
      fileKind: "chat",
      threadId: tuiThread.id,
    });
    expect(tuiChatEntries.some((entry) => entry.type === "message" && entry.content === "hello from tui")).toBe(true);

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
    expect(telegramChatEntries.some((entry) => (
      entry.type === "message"
      && entry.content === "hello from clog"
      && entry.reasoning === "Checked the most recent thread context before replying."
    ))).toBe(true);
    expect(telegramChatEntries.some((entry) => (
      entry.type === "message"
      && entry.content === "hello from clog"
      && Array.isArray(entry.thoughts)
      && entry.thoughts[0]?.toolCalls?.[0]?.toolName === "runtime_get_conversation"
      && entry.thoughts[0]?.toolResults?.[0]?.output === "{\"messages\":[]}"
    ))).toBe(true);
  });
});
