import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PostHogInsightQueryResult } from "../apps/clog/types";
import { PostHogPerformanceReporter } from "../apps/clog/src/ai/integrations/posthog/performance-reporter";

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
          case "performance_summary_60m":
            return createQueryResult(name, [{
              pageviews: 32,
              unique_visitors: 7,
              web_vitals_events: 14,
            }]);
          case "performance_top_paths_60m":
            return createQueryResult(name, [
              { path: "/memories", pageviews: 10 },
              { path: "/recipes", pageviews: 6 },
            ]);
          case "performance_lcp_60m":
            return createQueryResult(name, [
              { path: "/memories", lcp_value: 3200, samples: 8 },
              { path: "/recipes", lcp_value: 1800, samples: 5 },
            ]);
          case "performance_inp_60m":
            return createQueryResult(name, [
              { path: "/memories", inp_value: 260, samples: 8 },
              { path: "/recipes", inp_value: 120, samples: 5 },
            ]);
          case "performance_fcp_60m":
            return createQueryResult(name, [
              { path: "/memories", fcp_value: 2200, samples: 8 },
              { path: "/recipes", fcp_value: 1000, samples: 5 },
            ]);
          case "performance_cls_60m":
            return createQueryResult(name, [
              { path: "/memories", cls_value: 0.14, samples: 8 },
              { path: "/recipes", cls_value: 0.04, samples: 5 },
            ]);
          case "performance_errors_60m":
            return createQueryResult(name, [{
              exception_events: 3,
              distinct_exception_issues: 2,
            }]);
          case "performance_comparison_60m":
            return createQueryResult(name, [{
              current_pageviews: 32,
              previous_pageviews: 40,
              current_unique_visitors: 7,
              previous_unique_visitors: 9,
              current_web_vitals_events: 14,
              previous_web_vitals_events: 16,
              current_exception_events: 3,
              previous_exception_events: 1,
              current_distinct_exception_issues: 2,
              previous_distinct_exception_issues: 1,
            }]);
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
      readonly windowMinutes: number;
      readonly summary: {
        readonly exceptionEvents: number;
        readonly slowLcpPages: number;
        readonly slowInpPages: number;
        readonly slowFcpPages: number;
        readonly slowClsPages: number;
        readonly anomalyCount: number;
        readonly productionReadinessScore: number;
      };
      readonly previousWindow: {
        readonly pageviewsDeltaPercent: number | null;
        readonly uniqueVisitorsDeltaPercent: number | null;
        readonly exceptionDeltaPercent: number | null;
        readonly distinctExceptionIssuesDeltaPercent: number | null;
      };
      readonly lcp: Array<{ readonly path: string; readonly status: string }>;
      readonly inp: Array<{ readonly path: string; readonly status: string }>;
      readonly fcp: Array<{ readonly path: string; readonly status: string }>;
      readonly cls: Array<{ readonly path: string; readonly status: string }>;
    };

    expect(report.status).toBe("ok");
    expect(report.windowMinutes).toBe(60);
    expect(report.summary.exceptionEvents).toBe(3);
    expect(report.summary.slowLcpPages).toBe(1);
    expect(report.summary.slowInpPages).toBe(1);
    expect(report.summary.slowFcpPages).toBe(1);
    expect(report.summary.slowClsPages).toBe(1);
    expect(report.summary.anomalyCount).toBeGreaterThan(0);
    expect(report.summary.productionReadinessScore).toBeLessThan(100);
    expect(report.previousWindow.pageviewsDeltaPercent).toBe(-20);
    expect(report.previousWindow.uniqueVisitorsDeltaPercent).toBe(-22.2);
    expect(report.previousWindow.exceptionDeltaPercent).toBe(200);
    expect(report.previousWindow.distinctExceptionIssuesDeltaPercent).toBe(100);
    expect(report.lcp.map((row) => ({ path: row.path, status: row.status }))).toEqual([
      { path: "/memories", status: "slow" },
      { path: "/recipes", status: "good" },
    ]);
    expect(report.inp.map((row) => ({ path: row.path, status: row.status }))).toEqual([
      { path: "/memories", status: "slow" },
      { path: "/recipes", status: "good" },
    ]);
    expect(report.fcp.map((row) => ({ path: row.path, status: row.status }))).toEqual([
      { path: "/memories", status: "slow" },
      { path: "/recipes", status: "good" },
    ]);
    expect(report.cls.map((row) => ({ path: row.path, status: row.status }))).toEqual([
      { path: "/memories", status: "slow" },
      { path: "/recipes", status: "good" },
    ]);
    expect(new Set(queryNames)).toEqual(new Set([
      "performance_summary_60m",
      "performance_top_paths_60m",
      "performance_lcp_60m",
      "performance_inp_60m",
      "performance_fcp_60m",
      "performance_cls_60m",
      "performance_errors_60m",
      "performance_comparison_60m",
    ]));
  });

  test("uses exact hour boundaries for the previous full hour", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "clog-performance-window-"));
    cleanupPaths.push(workspaceDir);
    const queries = new Map<string, string>();

    const reporter = new PostHogPerformanceReporter({
      workspaceDir,
      runQuery: async (name, query) => {
        queries.set(name, query);
        switch (name) {
          case "performance_summary_60m":
            return createQueryResult(name, [{ pageviews: 4, unique_visitors: 3, web_vitals_events: 2 }]);
          case "performance_top_paths_60m":
            return createQueryResult(name, [{ path: "/", pageviews: 4 }]);
          case "performance_lcp_60m":
            return createQueryResult(name, [{ path: "/", lcp_value: 2000, samples: 2 }]);
          case "performance_inp_60m":
            return createQueryResult(name, [{ path: "/", inp_value: 150, samples: 2 }]);
          case "performance_fcp_60m":
            return createQueryResult(name, [{ path: "/", fcp_value: 1200, samples: 2 }]);
          case "performance_cls_60m":
            return createQueryResult(name, [{ path: "/", cls_value: 0.05, samples: 2 }]);
          case "performance_errors_60m":
            return createQueryResult(name, [{ exception_events: 0, distinct_exception_issues: 0 }]);
          case "performance_comparison_60m":
            return createQueryResult(name, [{
              current_pageviews: 4,
              previous_pageviews: 5,
              current_unique_visitors: 3,
              previous_unique_visitors: 4,
              current_web_vitals_events: 2,
              previous_web_vitals_events: 3,
              current_exception_events: 0,
              previous_exception_events: 0,
              current_distinct_exception_issues: 0,
              previous_distinct_exception_issues: 0,
            }]);
          default:
            throw new Error(`Unexpected query name: ${name}`);
        }
      },
    });

    const windowEndAt = Date.UTC(2026, 3, 20, 2, 0, 0);
    await reporter.captureNow(windowEndAt);

    const currentWindowStartAt = windowEndAt - (60 * 60_000);
    const previousWindowStartAt = currentWindowStartAt - (60 * 60_000);
    const expectedCurrentRange =
      `timestamp >= toDateTime(${Math.trunc(currentWindowStartAt / 1_000)}) AND timestamp < toDateTime(${Math.trunc(windowEndAt / 1_000)})`;
    const expectedPreviousRange =
      `timestamp >= toDateTime(${Math.trunc(previousWindowStartAt / 1_000)}) AND timestamp < toDateTime(${Math.trunc(currentWindowStartAt / 1_000)})`;
    expect(queries.get("performance_summary_60m")).toContain(expectedCurrentRange);
    expect(queries.get("performance_top_paths_60m")).toContain(expectedCurrentRange);
    expect(queries.get("performance_errors_60m")).toContain(expectedCurrentRange);
    expect(queries.get("performance_comparison_60m")).toContain(expectedCurrentRange);
    expect(queries.get("performance_comparison_60m")).toContain(expectedPreviousRange);
  });
});
