import type { PostHogDashboardSnapshot } from "./dashboard-snapshot";

export interface MonitoringSnapshotForHealthSummary {
  readonly latestPerformanceReport: unknown | null;
  readonly recentPostHogOperations: ReadonlyArray<{
    readonly operation: string;
    readonly lastRecordedAt: number;
  }>;
}

const readProductionReadinessFromReport = (report: unknown): number | null => {
  if (!report || typeof report !== "object") {
    return null;
  }

  const record = report as Record<string, unknown>;
  const summary = record.summary;
  if (!summary || typeof summary !== "object") {
    return null;
  }

  const score = (summary as Record<string, unknown>).productionReadinessScore;
  return typeof score === "number" && Number.isFinite(score) ? score : null;
};

export const buildPostHogHealthSummary = (
  dashboard: PostHogDashboardSnapshot,
  monitoring: MonitoringSnapshotForHealthSummary,
) => {
  const topAnomalies = dashboard.anomalies.slice(0, 5).map((anomaly) => ({
    title: anomaly.title,
    severity: anomaly.severity,
  }));

  const operations = monitoring.recentPostHogOperations.map((op) => ({
    operation: op.operation,
    lastRecordedAt: op.lastRecordedAt,
  }));

  const latestScore = readProductionReadinessFromReport(monitoring.latestPerformanceReport);
  const lines = [
    `Health @ dashboard snapshot (${dashboard.windowMinutes}m window)`,
    `- Production readiness: ${dashboard.summary.productionReadinessScore}/100 (${dashboard.summary.anomalyCount} anomalies)`,
    `- Traffic: ${dashboard.summary.pageviews} pageviews, ${dashboard.summary.uniqueVisitors} visitors`,
    `- Error rate (per 1k pageviews): ${dashboard.summary.errorRatePer1kPageviews.toFixed(2)}`,
    `- Pageviews vs prior window: ${dashboard.previousWindow.pageviewsDeltaPercent === null
      ? "n/a"
      : `${dashboard.previousWindow.pageviewsDeltaPercent.toFixed(1)}%`}`,
    latestScore === null
      ? "- Latest performance report score: n/a"
      : `- Latest performance report score: ${latestScore}/100`,
    operations.length === 0
      ? "- Recent PostHog operations: none recorded"
      : `- Recent PostHog operations: ${operations.map((o) => `${o.operation}@${o.lastRecordedAt}`).join(", ")}`,
    topAnomalies.length === 0
      ? "- Top anomalies: none"
      : `- Top anomalies: ${topAnomalies.map((a) => `[${a.severity}] ${a.title}`).join("; ")}`,
  ];

  return {
    generatedAt: dashboard.generatedAt,
    dashboard: {
      windowMinutes: dashboard.windowMinutes,
      productionReadinessScore: dashboard.summary.productionReadinessScore,
      anomalyCount: dashboard.summary.anomalyCount,
      pageviews: dashboard.summary.pageviews,
      uniqueVisitors: dashboard.summary.uniqueVisitors,
      errorRatePer1kPageviews: dashboard.summary.errorRatePer1kPageviews,
      pageviewsDeltaPercent: dashboard.previousWindow.pageviewsDeltaPercent,
      topAnomalies,
    },
    monitoring: {
      latestProductionReadinessScore: latestScore,
      operations,
    },
    printout: lines.join("\n"),
  };
};

export interface PostHogAssetSummaryInput {
  readonly dashboards: ReadonlyArray<{ readonly id: string | null; readonly name: string | null }>;
  readonly insights: ReadonlyArray<{ readonly id: string | null; readonly name: string | null }>;
  readonly entityHits: ReadonlyArray<{ readonly id: string | null; readonly type: string | null; readonly name: string | null }>;
  readonly schemaEntities: ReadonlyArray<{ readonly name: string; readonly kind: string | null }>;
  readonly totals: {
    readonly dashboardsListed: number;
    readonly insightsListed: number;
    readonly entityHits: number;
    readonly schemaEntities: number;
  };
}

export const buildPostHogAssetSummary = (input: PostHogAssetSummaryInput, generatedAt: number) => {
  const lines = [
    "PostHog asset summary",
    `- Dashboards (sample): ${input.dashboards.length === 0
      ? "none"
      : input.dashboards.map((d) => `${d.name ?? d.id ?? "?"}${d.id ? ` [${d.id}]` : ""}`).join("; ")}`,
    `- Insights (sample): ${input.insights.length === 0
      ? "none"
      : input.insights.map((i) => `${i.name ?? i.id ?? "?"}${i.id ? ` [${i.id}]` : ""}`).join("; ")}`,
    input.entityHits.length === 0
      ? "- Entity search hits: none"
      : `- Entity search hits: ${input.entityHits.map((e) => `${e.name ?? e.id ?? "?"} (${e.type ?? "?"})`).join("; ")}`,
    input.schemaEntities.length === 0
      ? "- Schema entities: none"
      : `- Schema entities: ${input.schemaEntities.map((s) => `${s.name}${s.kind ? ` (${s.kind})` : ""}`).join("; ")}`,
  ];

  return {
    generatedAt,
    dashboards: [...input.dashboards],
    insights: [...input.insights],
    entityHits: [...input.entityHits],
    schemaEntities: [...input.schemaEntities],
    totals: input.totals,
    printout: lines.join("\n"),
  };
};

export interface PostHogReleaseSummaryInput {
  readonly flags: ReadonlyArray<{
    readonly key: string | null;
    readonly name: string | null;
    readonly active: boolean | null;
    readonly rolloutPercentage: number | null;
    readonly status: string | null;
  }>;
  readonly experiments: ReadonlyArray<{
    readonly id: string | null;
    readonly name: string | null;
    readonly status: string | null;
    readonly featureFlagKey: string | null;
  }>;
  readonly errorObservations: ReadonlyArray<{
    readonly id: string;
    readonly severity: "info" | "warning" | "critical";
    readonly summary: string;
  }>;
  readonly logAttributes: ReadonlyArray<{ readonly key: string; readonly type: string | null }>;
  readonly totals: {
    readonly flags: number;
    readonly experiments: number;
    readonly errorObservations: number;
    readonly logAttributes: number;
  };
}

export const buildPostHogReleaseSummary = (input: PostHogReleaseSummaryInput, generatedAt: number) => {
  const lines = [
    "PostHog release / rollout summary",
    `- Flags (sample ${input.flags.length}): ${input.flags.length === 0
      ? "none"
      : input.flags.map((f) => `${f.key ?? f.name ?? "?"} active=${f.active ?? "?"} rollout=${f.rolloutPercentage ?? "n/a"}%`).join("; ")}`,
    `- Experiments (sample ${input.experiments.length}): ${input.experiments.length === 0
      ? "none"
      : input.experiments.map((e) => `${e.name ?? e.id ?? "?"} [${e.status ?? "?"}] flag=${e.featureFlagKey ?? "n/a"}`).join("; ")}`,
    input.errorObservations.length === 0
      ? "- Error observations: none in sample"
      : `- Error observations: ${input.errorObservations.map((o) => `[${o.severity}] ${o.summary}`).join("; ")}`,
    input.logAttributes.length === 0
      ? "- Log attributes (sample): none"
      : `- Log attributes (sample): ${input.logAttributes.map((a) => `${a.key}${a.type ? `:${a.type}` : ""}`).join(", ")}`,
  ];

  return {
    generatedAt,
    flags: [...input.flags],
    experiments: [...input.experiments],
    errorObservations: [...input.errorObservations],
    logAttributes: [...input.logAttributes],
    totals: input.totals,
    printout: lines.join("\n"),
  };
};
