import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
});
