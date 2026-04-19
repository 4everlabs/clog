import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PostHogInsightQueryResult } from "@clog/types";
import {
  buildPostHogDashboardSnapshot,
  POSTHOG_DASHBOARD_DEFAULT_WINDOW_MINUTES,
  type PostHogDashboardSnapshot,
} from "./dashboard-snapshot";

const writeStdoutLine = (value: string): void => {
  process.stdout.write(`${value}\n`);
};

const writeStderrLine = (value: string): void => {
  process.stderr.write(`${value}\n`);
};

const PERFORMANCE_REPORT_INTERVAL_MS = 15 * 60_000;
const PERFORMANCE_REPORT_RETENTION_LIMIT = 48;
export const POSTHOG_PERFORMANCE_REPORT_DIRECTORY_NAME = "performance-reports";

interface PerformanceReportSuccess extends PostHogDashboardSnapshot {
  readonly kind: "posthog-performance-report";
  readonly status: "ok";
  readonly createdAt: number;
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

const describeError = (error: unknown): string => {
  return error instanceof Error ? error.stack ?? error.message : String(error);
};

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
    this.reportDirectory = join(config.workspaceDir, POSTHOG_PERFORMANCE_REPORT_DIRECTORY_NAME);
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
          windowMinutes: POSTHOG_DASHBOARD_DEFAULT_WINDOW_MINUTES,
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
    const snapshot = await buildPostHogDashboardSnapshot({
      generatedAt: createdAt,
      runQuery: this.config.runQuery,
    });

    return {
      kind: "posthog-performance-report",
      status: "ok",
      createdAt,
      ...snapshot,
    };
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
