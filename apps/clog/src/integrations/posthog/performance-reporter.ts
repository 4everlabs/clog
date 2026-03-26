import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PostHogInsightQueryResult } from "@clog/types";

const writeStdoutLine = (value: string): void => {
  process.stdout.write(`${value}\n`);
};

const writeStderrLine = (value: string): void => {
  process.stderr.write(`${value}\n`);
};

const PERFORMANCE_REPORT_INTERVAL_MS = 15 * 60_000;
const PERFORMANCE_REPORT_RETENTION_LIMIT = 48;
const PERFORMANCE_REPORT_DIRECTORY = "performance-reports";
const PERFORMANCE_REPORT_WINDOW_MINUTES = 15;
const LCP_SLOW_THRESHOLD_MS = 2_500;
const INP_SLOW_THRESHOLD_MS = 100;
const PATH_EXPRESSION = "coalesce(nullIf(properties.$pathname, ''), nullIf(properties.$current_url, ''), '<unknown>')";

const SUMMARY_QUERY = `
SELECT
  countIf(event = '$pageview') AS pageviews,
  uniqIf(person_id, event = '$pageview') AS unique_visitors,
  countIf(event = '$web_vitals') AS web_vitals_events
FROM events
WHERE timestamp >= now() - INTERVAL 15 MINUTE
`;

const TOP_PATHS_QUERY = `
SELECT
  ${PATH_EXPRESSION} AS path,
  count() AS pageviews
FROM events
WHERE event = '$pageview'
  AND timestamp >= now() - INTERVAL 15 MINUTE
GROUP BY path
ORDER BY pageviews DESC
LIMIT 10
`;

const LCP_QUERY = `
SELECT
  ${PATH_EXPRESSION} AS path,
  quantile(0.75)(toFloat64OrNull(properties.$web_vitals_LCP_value)) AS lcp_p75_ms,
  count() AS samples
FROM events
WHERE event = '$web_vitals'
  AND timestamp >= now() - INTERVAL 15 MINUTE
  AND toFloat64OrNull(properties.$web_vitals_LCP_value) IS NOT NULL
GROUP BY path
HAVING samples >= 3
ORDER BY lcp_p75_ms DESC
LIMIT 10
`;

const INP_QUERY = `
SELECT
  ${PATH_EXPRESSION} AS path,
  quantile(0.75)(toFloat64OrNull(properties.$web_vitals_INP_value)) AS inp_p75_ms,
  count() AS samples
FROM events
WHERE event = '$web_vitals'
  AND timestamp >= now() - INTERVAL 15 MINUTE
  AND toFloat64OrNull(properties.$web_vitals_INP_value) IS NOT NULL
GROUP BY path
HAVING samples >= 3
ORDER BY inp_p75_ms DESC
LIMIT 10
`;

interface PerformanceRow {
  readonly path: string;
  readonly valueMs: number;
  readonly samples: number;
  readonly status: "good" | "slow";
}

interface TopPathRow {
  readonly path: string;
  readonly pageviews: number;
}

interface PerformanceSummaryRow {
  readonly pageviews: number;
  readonly uniqueVisitors: number;
  readonly webVitalsEvents: number;
}

interface PerformanceReportSuccess {
  readonly kind: "posthog-performance-report";
  readonly status: "ok";
  readonly createdAt: number;
  readonly windowMinutes: number;
  readonly summary: {
    readonly pageviews: number;
    readonly uniqueVisitors: number;
    readonly webVitalsEvents: number;
    readonly slowLcpPages: number;
    readonly slowInpPages: number;
  };
  readonly topPaths: readonly TopPathRow[];
  readonly lcp: readonly PerformanceRow[];
  readonly inp: readonly PerformanceRow[];
}

interface PerformanceReportFailure {
  readonly kind: "posthog-performance-report";
  readonly status: "error";
  readonly createdAt: number;
  readonly windowMinutes: number;
  readonly error: string;
}

type PerformanceReport = PerformanceReportSuccess | PerformanceReportFailure;

interface PerformanceReportFile {
  readonly name: string;
  readonly createdAt: number;
}

export interface PostHogPerformanceReporterConfig {
  readonly workspaceDir: string;
  readonly runQuery: (name: string, query: string) => Promise<PostHogInsightQueryResult>;
  readonly enqueue?: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly intervalMs?: number;
  readonly retentionLimit?: number;
}

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
};

const toString = (value: unknown): string => {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "<unknown>";
};

const describeError = (error: unknown): string => {
  return error instanceof Error ? error.stack ?? error.message : String(error);
};

const classifyMetric = (valueMs: number, slowThresholdMs: number): "good" | "slow" => (
  valueMs > slowThresholdMs ? "slow" : "good"
);

const formatReportFileName = (createdAt: number, sequence: number): string => {
  const timestamp = new Date(createdAt).toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return `${timestamp}-${sequence.toString().padStart(4, "0")}.json`;
};

const parseReportCreatedAt = (path: string): number => {
  try {
    const value = JSON.parse(readFileSync(path, "utf-8")) as Partial<PerformanceReport>;
    return typeof value.createdAt === "number" ? value.createdAt : 0;
  } catch {
    return 0;
  }
};

export class PostHogPerformanceReporter {
  private readonly reportDirectory: string;
  private readonly intervalMs: number;
  private readonly retentionLimit: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<void> | null = null;
  private sequence = 0;

  constructor(private readonly config: PostHogPerformanceReporterConfig) {
    this.reportDirectory = join(config.workspaceDir, PERFORMANCE_REPORT_DIRECTORY);
    this.intervalMs = config.intervalMs ?? PERFORMANCE_REPORT_INTERVAL_MS;
    this.retentionLimit = config.retentionLimit ?? PERFORMANCE_REPORT_RETENTION_LIMIT;
  }

  start(): void {
    void this.captureNow();
    this.timer = setInterval(() => {
      void this.captureNow();
    }, this.intervalMs);

    if (typeof this.timer?.unref === "function") {
      this.timer.unref();
    }
  }

  async captureNow(): Promise<void> {
    if (this.inFlight) {
      return await this.inFlight;
    }

    const execute = async () => {
      const createdAt = Date.now();
      try {
        const report = await this.buildReport(createdAt);
        this.writeReport(report);
        writeStdoutLine(`[posthog-performance] wrote report ${new Date(createdAt).toISOString()}`);
      } catch (error) {
        const failure: PerformanceReportFailure = {
          kind: "posthog-performance-report",
          status: "error",
          createdAt,
          windowMinutes: PERFORMANCE_REPORT_WINDOW_MINUTES,
          error: describeError(error),
        };
        this.writeReport(failure);
        writeStderrLine(`[posthog-performance] failed to capture report: ${failure.error}`);
      }
    };

    const run = this.config.enqueue
      ? this.config.enqueue(async () => {
          await execute();
        })
      : execute();

    this.inFlight = run.finally(() => {
      this.inFlight = null;
    });

    return await this.inFlight;
  }

  private async buildReport(createdAt: number): Promise<PerformanceReportSuccess> {
    const summaryResult = await this.config.runQuery("performance_summary_15m", SUMMARY_QUERY);
    const topPathsResult = await this.config.runQuery("performance_top_paths_15m", TOP_PATHS_QUERY);
    const lcpResult = await this.config.runQuery("performance_lcp_15m", LCP_QUERY);
    const inpResult = await this.config.runQuery("performance_inp_15m", INP_QUERY);

    const summaryRow = this.readSummary(summaryResult.results[0]);
    const topPaths = this.readTopPaths(topPathsResult.results);
    const lcp = this.readPerformanceRows(lcpResult.results, "lcp_p75_ms", LCP_SLOW_THRESHOLD_MS);
    const inp = this.readPerformanceRows(inpResult.results, "inp_p75_ms", INP_SLOW_THRESHOLD_MS);

    return {
      kind: "posthog-performance-report",
      status: "ok",
      createdAt,
      windowMinutes: PERFORMANCE_REPORT_WINDOW_MINUTES,
      summary: {
        pageviews: summaryRow.pageviews,
        uniqueVisitors: summaryRow.uniqueVisitors,
        webVitalsEvents: summaryRow.webVitalsEvents,
        slowLcpPages: lcp.filter((row) => row.status === "slow").length,
        slowInpPages: inp.filter((row) => row.status === "slow").length,
      },
      topPaths,
      lcp,
      inp,
    };
  }

  private readSummary(row: Record<string, unknown> | undefined): PerformanceSummaryRow {
    return {
      pageviews: toNumber(row?.pageviews),
      uniqueVisitors: toNumber(row?.unique_visitors),
      webVitalsEvents: toNumber(row?.web_vitals_events),
    };
  }

  private readTopPaths(rows: readonly Record<string, unknown>[]): TopPathRow[] {
    return rows.map((row) => ({
      path: toString(row.path),
      pageviews: toNumber(row.pageviews),
    }));
  }

  private readPerformanceRows(
    rows: readonly Record<string, unknown>[],
    metricKey: "lcp_p75_ms" | "inp_p75_ms",
    slowThresholdMs: number,
  ): PerformanceRow[] {
    return rows.map((row) => {
      const valueMs = toNumber(row[metricKey]);
      return {
        path: toString(row.path),
        valueMs,
        samples: toNumber(row.samples),
        status: classifyMetric(valueMs, slowThresholdMs),
      };
    });
  }

  private writeReport(report: PerformanceReport): void {
    mkdirSync(this.reportDirectory, { recursive: true });
    const path = join(this.reportDirectory, formatReportFileName(report.createdAt, this.sequence));
    this.sequence += 1;
    writeFileSync(path, JSON.stringify(report, null, 2));
    this.pruneOldReports();
  }

  private pruneOldReports(): void {
    const reports = this.listReportFiles();
    const excess = reports.length - this.retentionLimit;
    if (excess <= 0) {
      return;
    }

    for (const report of reports.slice(0, excess)) {
      rmSync(join(this.reportDirectory, report.name), { force: true });
    }
  }

  private listReportFiles(): PerformanceReportFile[] {
    try {
      return readdirSync(this.reportDirectory)
        .filter((name) => name.endsWith(".json"))
        .map((name) => ({
          name,
          createdAt: parseReportCreatedAt(join(this.reportDirectory, name)),
        }))
        .sort((left, right) => left.createdAt - right.createdAt || left.name.localeCompare(right.name));
    } catch {
      return [];
    }
  }
}
