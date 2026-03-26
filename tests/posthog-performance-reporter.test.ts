import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PostHogInsightQueryResult } from "../apps/clog/types";
import { PostHogPerformanceReporter } from "../apps/clog/src/integrations/posthog/performance-reporter";

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (path) {
      rmSync(path, { recursive: true, force: true });
    }
  }
});

const createQueryResult = (name: string, results: readonly Record<string, unknown>[]): PostHogInsightQueryResult => ({
  name,
  columns: Object.keys(results[0] ?? {}),
  results,
});

describe("PostHogPerformanceReporter", () => {
  test("keeps only the newest 48 performance reports", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "clog-performance-reports-"));
    cleanupPaths.push(workspaceDir);
    const queryNames: string[] = [];

    const reporter = new PostHogPerformanceReporter({
      workspaceDir,
      retentionLimit: 48,
      runQuery: async (name) => {
        queryNames.push(name);
        switch (name) {
          case "performance_summary_15m":
            return createQueryResult(name, [{
              pageviews: 32,
              unique_visitors: 7,
              web_vitals_events: 14,
            }]);
          case "performance_top_paths_15m":
            return createQueryResult(name, [
              { path: "/memories", pageviews: 10 },
              { path: "/recipes", pageviews: 6 },
            ]);
          default:
            throw new Error(`Unexpected query name: ${name}`);
        }
      },
    });

    for (let index = 0; index < 50; index += 1) {
      await reporter.captureNow();
    }

    const reportDir = join(workspaceDir, "performance-reports");
    const files = readdirSync(reportDir).filter((name) => name.endsWith(".json")).sort();
    expect(files).toHaveLength(48);
    expect(files.some((name) => name.endsWith("-0000.json"))).toBe(false);
    expect(files.some((name) => name.endsWith("-0001.json"))).toBe(false);

    const latestFile = files.at(-1);
    expect(latestFile).toBeString();
    const report = JSON.parse(readFileSync(join(reportDir, latestFile!), "utf-8")) as {
      readonly status: string;
      readonly summary: {
        readonly slowLcpPages: number;
        readonly slowInpPages: number;
      };
      readonly lcp: Array<{ readonly path: string; readonly status: string }>;
      readonly inp: Array<{ readonly path: string; readonly status: string }>;
    };

    expect(report.status).toBe("ok");
    expect(report.summary.slowLcpPages).toBe(0);
    expect(report.summary.slowInpPages).toBe(0);
    expect(report.lcp).toEqual([]);
    expect(report.inp).toEqual([]);
    expect(new Set(queryNames)).toEqual(new Set([
      "performance_summary_15m",
      "performance_top_paths_15m",
    ]));
  });
});
