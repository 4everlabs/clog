import type { IntegrationHealthView, RuntimeObservation } from "@clog/types";
import type { PostHogRuntimeConfig } from "../../config";
import type { PostHogApiClient } from "./api-client";

export interface PostHogIntegrationClientConfig {
  readonly api: Pick<PostHogApiClient, "callMcpTool" | "runQuery">;
  readonly config: PostHogRuntimeConfig;
  readonly capabilities: {
    readonly canReadErrors: boolean;
    readonly canReadInsights: boolean;
  };
}

interface ErrorTrackingIssueRow {
  readonly id?: string | null;
  readonly status?: string | null;
  readonly name?: string | null;
  readonly description?: string | null;
  readonly first_seen?: string | null;
  readonly _posthogUrl?: string | null;
}

const toTimestamp = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Date.now();
};

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

const sanitizeId = (value: string): string => (
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
);

const readMetricValue = (row: Record<string, unknown>, keys: readonly string[]): number => {
  for (const key of keys) {
    const value = toNumber(row[key]);
    if (value !== 0 || row[key] === 0 || row[key] === "0") {
      return value;
    }
  }

  return 0;
};

export class PostHogIntegrationClient {
  constructor(private readonly deps: PostHogIntegrationClientConfig) {}

  async listObservations(): Promise<readonly RuntimeObservation[]> {
    const results = await Promise.all([
      this.listErrorObservations(),
      this.listInsightRegressionObservations(),
    ]);

    return results.flat();
  }

  async listErrorObservations(): Promise<readonly RuntimeObservation[]> {
    if (!this.deps.capabilities.canReadErrors) {
      return [];
    }

    const result = await this.deps.api.callMcpTool("error-tracking-issues-list", {
      limit: 10,
      offset: 0,
    });
    const structured = result.structuredContent;
    const results = Array.isArray((structured as { results?: unknown[] } | undefined)?.results)
      ? (structured as { results: unknown[] }).results
      : [];

    return results.flatMap((row) => {
      const issue = row as ErrorTrackingIssueRow;
      const issueId = issue.id?.trim();
      if (!issueId) {
        return [];
      }

      const name = issue.name?.trim() || "Error";
      const description = issue.description?.trim() || "No error description provided";
      const status = issue.status?.trim() || "unknown";
      const detectedAt = toTimestamp(issue.first_seen);
      const severity = status === "active" ? "warning" : "info";

      return [{
        id: `posthog-error-${issueId}`,
        kind: "error-rate-spike",
        source: {
          kind: "posthog",
          label: "PostHog error tracking",
          referenceId: issueId,
          url: issue._posthogUrl ?? undefined,
        },
        summary: `${name} is ${status} in PostHog error tracking`,
        details: description,
        severity,
        detectedAt,
        metadata: {
          issueId,
          status,
          name,
          posthogUrl: issue._posthogUrl ?? null,
        },
      } satisfies RuntimeObservation];
    });
  }

  async listInsightRegressionObservations(): Promise<readonly RuntimeObservation[]> {
    if (!this.deps.capabilities.canReadInsights || this.deps.config.insightMonitors.length === 0) {
      return [];
    }

    const results: Array<RuntimeObservation | null> = await Promise.all(this.deps.config.insightMonitors.map(async (monitor) => {
      const response = await this.deps.api.runQuery(`monitor_${sanitizeId(monitor.name)}`, monitor.query);
      const row = response.results[0];
      if (!row) {
        return null;
      }

      const currentValue = readMetricValue(row, ["current_value", "current", "value", "current_count"]);
      const previousValue = readMetricValue(row, ["previous_value", "previous", "baseline", "previous_count"]);

      if (previousValue < monitor.minimumPreviousValue || previousValue <= 0) {
        return null;
      }

      const dropPercent = ((previousValue - currentValue) / previousValue) * 100;
      if (dropPercent < monitor.regressionThresholdPercent) {
        return null;
      }

      return {
        id: `posthog-insight-${sanitizeId(monitor.name)}`,
        kind: "insight-regression",
        source: {
          kind: "posthog",
          label: "PostHog insight monitor",
          referenceId: monitor.name,
        },
        summary: `${monitor.name} regressed ${dropPercent.toFixed(1)}%`,
        details: `${monitor.name} fell from ${previousValue} to ${currentValue} in the configured comparison window.`,
        severity: dropPercent >= monitor.regressionThresholdPercent * 2 ? "critical" : "warning",
        detectedAt: Date.now(),
        metadata: {
          monitorName: monitor.name,
          currentValue,
          previousValue,
          dropPercent: Number(dropPercent.toFixed(2)),
          thresholdPercent: monitor.regressionThresholdPercent,
        },
      } satisfies RuntimeObservation;
    }));

    return results.flatMap((result) => result ? [result] : []);
  }

  async getHealth(): Promise<IntegrationHealthView> {
    const ready = Boolean(this.deps.config.projectId && this.deps.config.personalApiKey);
    return {
      kind: "posthog",
      status: ready ? "ready" : "missing-config",
      summary: ready ? "PostHog integration is configured." : "PostHog integration is using stubbed or missing configuration.",
      lastCheckedAt: Date.now(),
    };
  }
}
