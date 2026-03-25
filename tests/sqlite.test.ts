import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AgentFinding } from "@clog/types";
import { SqliteRuntimeStore } from "../apps/clog/src/storage/sqlite";

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (path) {
      rmSync(path, { recursive: true, force: true });
    }
  }
});

const createStore = () => {
  const root = mkdtempSync(join(tmpdir(), "clog-sqlite-store-"));
  cleanupPaths.push(root);

  return new SqliteRuntimeStore({
    instanceId: "test-instance",
    instanceRoot: root,
    storageDir: join(root, "storage"),
    databasePath: join(root, "storage", "runtime.sqlite"),
  });
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

describe("SqliteRuntimeStore", () => {
  test("persists status, findings, and threads across store instances", () => {
    const store = createStore();
    store.setStatus("idle");
    store.upsertFindings([sampleFinding]);
    const thread = store.seedOperatorThread("telegram");
    const userMessage = store.createMessage("user", "telegram", "hello");
    store.appendMessages(thread.id, [userMessage]);
    store.close();

    const reopened = new SqliteRuntimeStore(store.config);

    expect(reopened.getStatus()).toBe("idle");
    expect(reopened.listFindings()).toHaveLength(1);
    expect(reopened.listFindings()[0]?.title).toBe("Test finding");
    expect(reopened.listThreads()).toHaveLength(1);
    expect(reopened.listThreads()[0]?.messages.some((message) => message.content === "hello")).toBe(true);
    reopened.close();
  });
});
