import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RuntimeReadService } from "../apps/clog/src/runtime/read-service";
import { InMemoryRuntimeStore } from "../apps/clog/src/storage/in-memory-runtime-store";

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (path) {
      rmSync(path, { recursive: true, force: true });
    }
  }
});

describe("RuntimeReadService", () => {
  test("reads recent runtime logs from session directories and legacy log files", () => {
    const instanceRoot = mkdtempSync(join(tmpdir(), "clog-runtime-logs-"));
    cleanupPaths.push(instanceRoot);
    const storageDir = join(instanceRoot, "storage");
    const stateDir = join(storageDir, "state");
    const workspaceDir = join(instanceRoot, "workspace");
    const readOnlyDir = join(instanceRoot, "read-only");
    mkdirSync(stateDir, { recursive: true });
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(readOnlyDir, { recursive: true });

    const newestSessionDir = join(storageDir, "sessions", "2026-04-19T02-29-45-655Z");
    const olderSessionDir = join(storageDir, "sessions", "2026-04-18T22-34-18-530Z");
    const legacyLogsDir = join(storageDir, "logs");
    mkdirSync(newestSessionDir, { recursive: true });
    mkdirSync(olderSessionDir, { recursive: true });
    mkdirSync(legacyLogsDir, { recursive: true });
    writeFileSync(join(newestSessionDir, "system.log"), "first\nsecond\nthird\n");
    writeFileSync(join(olderSessionDir, "system.log"), "older one\nolder two\n");
    writeFileSync(join(legacyLogsDir, "2026-04-17T00-00-00-000Z.log"), "legacy one\nlegacy two\n");

    const service = new RuntimeReadService({
      storage: {
        instanceId: "test",
        instanceRoot,
        readOnlyDir,
        workspaceDir,
        storageDir,
        stateDir,
      },
      store: new InMemoryRuntimeStore(),
    });

    const recentLogs = service.getRecentLogs({
      fileLimit: 3,
      lineLimit: 2,
    });

    expect(recentLogs.files).toEqual([
      {
        fileName: "system.log",
        relativePath: "sessions/2026-04-19T02-29-45-655Z/system.log",
        totalLines: 3,
        returnedLines: 2,
        truncated: true,
        content: "second\nthird",
      },
      {
        fileName: "system.log",
        relativePath: "sessions/2026-04-18T22-34-18-530Z/system.log",
        totalLines: 2,
        returnedLines: 2,
        truncated: false,
        content: "older one\nolder two",
      },
      {
        fileName: "2026-04-17T00-00-00-000Z.log",
        relativePath: "logs/2026-04-17T00-00-00-000Z.log",
        totalLines: 2,
        returnedLines: 2,
        truncated: false,
        content: "legacy one\nlegacy two",
      },
    ]);

    const filteredLogs = service.getRecentLogs({
      pathContains: "2026-04-18",
    });
    expect(filteredLogs.files).toEqual([
      {
        fileName: "system.log",
        relativePath: "sessions/2026-04-18T22-34-18-530Z/system.log",
        totalLines: 2,
        returnedLines: 2,
        truncated: false,
        content: "older one\nolder two",
      },
    ]);
  });

  test("reads retained monitoring artifacts from the workspace", () => {
    const instanceRoot = mkdtempSync(join(tmpdir(), "clog-runtime-read-"));
    cleanupPaths.push(instanceRoot);
    const storageDir = join(instanceRoot, "storage");
    const stateDir = join(storageDir, "state");
    const workspaceDir = join(instanceRoot, "workspace");
    const readOnlyDir = join(instanceRoot, "read-only");
    mkdirSync(stateDir, { recursive: true });
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(readOnlyDir, { recursive: true });

    writeFileSync(join(workspaceDir, "posthog-tool-output.json"), JSON.stringify({
      updatedAt: 30,
      operations: {
        dashboardSnapshot: {
          lastRecordedAt: 30,
          history: [
            { recordedAt: 10, data: { id: 1 } },
            { recordedAt: 20, data: { id: 2 } },
            { recordedAt: 30, data: { id: 3 } },
          ],
        },
      },
    }, null, 2));
    const reportsDir = join(workspaceDir, "performance-reports");
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(join(reportsDir, "2026-04-01T00-00-00-000Z-0000.json"), JSON.stringify({
      createdAt: 10,
      status: "ok",
      summary: { productionReadinessScore: 80 },
    }));
    writeFileSync(join(reportsDir, "2026-04-01T00-05-00-000Z-0001.json"), JSON.stringify({
      createdAt: 20,
      status: "ok",
      summary: { productionReadinessScore: 92 },
    }));

    const service = new RuntimeReadService({
      storage: {
        instanceId: "test",
        instanceRoot,
        readOnlyDir,
        workspaceDir,
        storageDir,
        stateDir,
      },
      store: new InMemoryRuntimeStore(),
    });

    const snapshot = service.getMonitoringSnapshot({
      reportLimit: 1,
      operationHistoryLimit: 2,
    });

    expect(snapshot.latestPerformanceReport).toMatchObject({
      createdAt: 20,
      summary: { productionReadinessScore: 92 },
    });
    expect(snapshot.recentPerformanceReports).toHaveLength(1);
    expect(snapshot.recentPostHogOperations).toEqual([{
      operation: "dashboardSnapshot",
      lastRecordedAt: 30,
      history: [
        { recordedAt: 30, data: { id: 3 } },
        { recordedAt: 20, data: { id: 2 } },
      ],
    }]);
  });

  test("ignores obsolete PostHog workspace operation shapes", () => {
    const instanceRoot = mkdtempSync(join(tmpdir(), "clog-runtime-read-obsolete-"));
    cleanupPaths.push(instanceRoot);
    const storageDir = join(instanceRoot, "storage");
    const stateDir = join(storageDir, "state");
    const workspaceDir = join(instanceRoot, "workspace");
    const readOnlyDir = join(instanceRoot, "read-only");
    mkdirSync(stateDir, { recursive: true });
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(readOnlyDir, { recursive: true });

    writeFileSync(join(workspaceDir, "posthog-tool-output.json"), JSON.stringify({
      updatedAt: 30,
      operations: {
        obsoleteDashboardSnapshot: {
          recordedAt: 30,
          data: { id: 3 },
        },
      },
    }, null, 2));

    const service = new RuntimeReadService({
      storage: {
        instanceId: "test",
        instanceRoot,
        readOnlyDir,
        workspaceDir,
        storageDir,
        stateDir,
      },
      store: new InMemoryRuntimeStore(),
    });

    const snapshot = service.getMonitoringSnapshot();
    expect(snapshot.recentPostHogOperations).toEqual([]);
  });

  test("reads a runtime json artifact and supports nested field selection", () => {
    const instanceRoot = mkdtempSync(join(tmpdir(), "clog-runtime-json-"));
    cleanupPaths.push(instanceRoot);
    const storageDir = join(instanceRoot, "storage");
    const stateDir = join(storageDir, "state");
    const workspaceDir = join(instanceRoot, "workspace");
    const readOnlyDir = join(instanceRoot, "read-only");
    mkdirSync(stateDir, { recursive: true });
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(readOnlyDir, { recursive: true });

    writeFileSync(join(workspaceDir, "posthog-tool-output.json"), JSON.stringify({
      updatedAt: 30,
      operations: {
        dashboardSnapshot: {
          history: [
            { recordedAt: 10, data: { id: 1 } },
            { recordedAt: 20, data: { id: 2 } },
          ],
        },
      },
    }, null, 2));

    const service = new RuntimeReadService({
      storage: {
        instanceId: "test",
        instanceRoot,
        readOnlyDir,
        workspaceDir,
        storageDir,
        stateDir,
      },
      store: new InMemoryRuntimeStore(),
    });

    const root = service.readJson({
      path: "workspace/posthog-tool-output.json",
    });
    expect(root.path).toBe("workspace/posthog-tool-output.json");
    expect(root.valueType).toBe("object");
    expect(root.childKeys).toEqual(["updatedAt", "operations"]);
    if (!("value" in root)) {
      throw new Error("Expected untruncated root JSON read to include a value.");
    }
    expect(root.value).toMatchObject({
      updatedAt: 30,
    });

    const nested = service.readJson({
      path: "workspace/posthog-tool-output.json",
      fieldPath: "operations.dashboardSnapshot.history.1",
    });
    expect(nested.fieldPath).toBe("operations.dashboardSnapshot.history.1");
    expect(nested.valueType).toBe("object");
    if (!("value" in nested)) {
      throw new Error("Expected untruncated nested JSON read to include a value.");
    }
    expect(nested.value).toEqual({
      recordedAt: 20,
      data: { id: 2 },
    });
  });

  test("lists, reads, and writes workspace text files while keeping json reads inside workspace", () => {
    const instanceRoot = mkdtempSync(join(tmpdir(), "clog-runtime-workspace-"));
    cleanupPaths.push(instanceRoot);
    const storageDir = join(instanceRoot, "storage");
    const stateDir = join(storageDir, "state");
    const workspaceDir = join(instanceRoot, "workspace");
    const readOnlyDir = join(instanceRoot, "read-only");
    const projectDir = join(workspaceDir, "project");
    mkdirSync(stateDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(readOnlyDir, { recursive: true });

    writeFileSync(join(projectDir, "about.md"), "# About\nCurrent workspace note.\n");
    writeFileSync(join(stateDir, "status.json"), JSON.stringify({ ok: true }, null, 2));

    const service = new RuntimeReadService({
      storage: {
        instanceId: "test",
        instanceRoot,
        readOnlyDir,
        workspaceDir,
        storageDir,
        stateDir,
      },
      store: new InMemoryRuntimeStore(),
    });

    const listing = service.readKnowledge();
    expect(listing.availablePaths).toContain("workspace/project/about.md");

    const knowledge = service.readKnowledge({
      path: "project/about.md",
    });
    expect(knowledge.selectedPath).toBe("workspace/project/about.md");
    expect(knowledge.content).toContain("Current workspace note.");

    const writeResult = service.writeWorkspaceFile({
      path: "project/notes.md",
      content: "Fresh workspace note.\n",
    });
    expect(writeResult).toEqual({
      path: "workspace/project/notes.md",
      created: true,
      bytesWritten: 22,
    });
    expect(readFileSync(join(projectDir, "notes.md"), "utf-8")).toBe("Fresh workspace note.\n");

    expect(() => service.readJson({
      path: "../storage/state/status.json",
    })).toThrow(`Workspace path must stay inside ${workspaceDir}`);
  });

  test("lists conversations, reads paginated messages, and searches message bodies", () => {
    const instanceRoot = mkdtempSync(join(tmpdir(), "clog-runtime-conv-"));
    cleanupPaths.push(instanceRoot);
    const storageDir = join(instanceRoot, "storage");
    const stateDir = join(storageDir, "state");
    const workspaceDir = join(instanceRoot, "workspace");
    const readOnlyDir = join(instanceRoot, "read-only");
    mkdirSync(stateDir, { recursive: true });
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(readOnlyDir, { recursive: true });

    const store = new InMemoryRuntimeStore();
    const alpha = store.createThread("tui", "Alpha checkout thread");
    const staleTimestamp = Date.now() - 26 * 60 * 60 * 1_000;
    store.appendMessages(alpha.id, [
      {
        id: "msg_old_banana",
        role: "user",
        channel: "tui",
        content: "BANANA from yesterday",
        createdAt: staleTimestamp,
      },
      store.createMessage("user", "tui", "Need help with BANANA pricing"),
      store.createMessage("agent", "tui", "Banana pricing is fixed"),
    ]);
    const beta = store.createThread("web", "Beta web");
    store.appendMessages(beta.id, [
      store.createMessage("user", "web", "No banana issues here"),
    ]);

    const service = new RuntimeReadService({
      storage: {
        instanceId: "test",
        instanceRoot,
        readOnlyDir,
        workspaceDir,
        storageDir,
        stateDir,
      },
      store,
    });

    const listed = service.listConversations({ titleContains: "checkout", limit: 10 });
    expect(listed.conversations).toHaveLength(1);
    expect(listed.conversations[0]?.id).toBe(alpha.id);

    const page = service.getConversation({
      threadId: alpha.id,
      messageOffset: 0,
      messageLimit: 1,
    });
    expect(page.totalMessages).toBe(3);
    expect(page.messages).toHaveLength(1);
    expect(page.tokenBudget).toBe(3_000);
    expect(page.returnedTokenEstimate).toBeGreaterThan(0);
    expect(page.hasMoreMessages).toBe(true);
    expect(page.nextMessageOffset).toBe(1);
    expect(page.remainingMessages).toBe(2);
    expect(page.nextRequest).toEqual({
      toolName: "runtime_get_conversation",
      arguments: {
        threadId: alpha.id,
        messageOffset: 1,
        tokenBudget: 3000,
      },
    });
    expect(page.continuationHint).toContain(`threadId="${alpha.id}"`);

    const recentPage = service.getConversation({
      threadId: alpha.id,
      timePreset: "last_hour",
      messageLimit: 10,
    });
    expect(recentPage.totalMessages).toBe(2);
    expect(recentPage.nextMessageOffset).toBeNull();
    expect(recentPage.nextRequest).toBeNull();

    const tokenBoundedPage = service.getConversation({
      threadId: alpha.id,
      tokenBudget: 12,
    });
    expect(tokenBoundedPage.messages).toHaveLength(1);
    expect(tokenBoundedPage.hasMoreMessages).toBe(true);
    expect(tokenBoundedPage.nextRequest?.arguments.tokenBudget).toBe(12);
    expect(tokenBoundedPage.continuationHint).toContain("tokenBudget=12");

    const hits = service.searchMessages({ query: "banana", limit: 10 });
    expect(hits.matches.length).toBe(4);
    expect(hits.truncated).toBe(false);

    const recentHits = service.searchMessages({ query: "banana", limit: 10, timePreset: "last_hour" });
    expect(recentHits.matches.length).toBe(3);

    const scoped = service.searchMessages({ query: "banana", threadId: beta.id, limit: 10 });
    expect(scoped.matches).toHaveLength(1);

    for (let index = 0; index < 5; index += 1) {
      store.appendMessages(alpha.id, [store.createMessage("user", "tui", `token-${index}`)]);
    }
    const capped = service.searchMessages({ query: "token-", threadId: alpha.id, limit: 3 });
    expect(capped.matches).toHaveLength(3);
    expect(capped.truncated).toBe(true);
  });
});
