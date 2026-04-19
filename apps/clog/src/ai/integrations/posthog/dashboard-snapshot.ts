import type { PostHogInsightQueryResult } from "@clog/types";

export const POSTHOG_DASHBOARD_DEFAULT_WINDOW_MINUTES = 15;
export const POSTHOG_DASHBOARD_DEFAULT_TOP_PATHS_LIMIT = 10;
export const POSTHOG_PERFORMANCE_LCP_SLOW_THRESHOLD_MS = 2_500;
export const POSTHOG_PERFORMANCE_INP_SLOW_THRESHOLD_MS = 200;

const PATH_EXPRESSION = "coalesce(nullIf(properties.$pathname, ''), nullIf(properties.$current_url, ''), '<unknown>')";

export interface PostHogDashboardPerformanceRow {
  readonly path: string;
  readonly valueMs: number;
  readonly samples: number;
  readonly status: "good" | "slow";
}

export interface PostHogDashboardTopPathRow {
  readonly path: string;
  readonly pageviews: number;
}

export interface PostHogDashboardAnomaly {
  readonly id: string;
  readonly kind: "traffic-drop" | "exception-spike" | "slow-lcp" | "slow-inp" | "weak-web-vitals-coverage";
  readonly severity: "warning" | "critical";
  readonly title: string;
  readonly summary: string;
  readonly metric: string;
  readonly currentValue: number;
  readonly previousValue: number | null;
  readonly threshold: number;
  readonly path: string | null;
}

export interface PostHogDashboardSnapshot {
  readonly generatedAt: number;
  readonly windowMinutes: number;
  readonly summary: {
    readonly pageviews: number;
    readonly uniqueVisitors: number;
    readonly webVitalsEvents: number;
    readonly exceptionEvents: number;
    readonly distinctExceptionIssues: number;
    readonly webVitalsCoverageRatio: number;
    readonly errorRatePer1kPageviews: number;
    readonly slowLcpPages: number;
    readonly slowInpPages: number;
    readonly productionReadinessScore: number;
    readonly anomalyCount: number;
  };
  readonly previousWindow: {
    readonly pageviews: number;
    readonly webVitalsEvents: number;
    readonly exceptionEvents: number;
    readonly pageviewsDeltaPercent: number | null;
    readonly webVitalsDeltaPercent: number | null;
    readonly exceptionDeltaPercent: number | null;
  };
  readonly topPaths: readonly PostHogDashboardTopPathRow[];
  readonly lcp: readonly PostHogDashboardPerformanceRow[];
  readonly inp: readonly PostHogDashboardPerformanceRow[];
  readonly anomalies: readonly PostHogDashboardAnomaly[];
}

interface PerformanceSummaryRow {
  readonly pageviews: number;
  readonly uniqueVisitors: number;
  readonly webVitalsEvents: number;
}

interface ErrorSummaryRow {
  readonly exceptionEvents: number;
  readonly distinctExceptionIssues: number;
}

interface ComparisonRow {
  readonly currentPageviews: number;
  readonly previousPageviews: number;
  readonly currentWebVitalsEvents: number;
  readonly previousWebVitalsEvents: number;
  readonly currentExceptionEvents: number;
  readonly previousExceptionEvents: number;
}

export interface BuildPostHogDashboardSnapshotInput {
  readonly generatedAt?: number;
  readonly windowMinutes?: number;
  readonly topPathsLimit?: number;
  readonly runQuery: (name: string, query: string) => Promise<PostHogInsightQueryResult>;
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

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

const round = (value: number, decimals = 1): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const classifyMetric = (valueMs: number, slowThresholdMs: number): "good" | "slow" => (
  valueMs > slowThresholdMs ? "slow" : "good"
);

const formatWindow = (minutes: number): string => `${Math.max(1, Math.trunc(minutes))} MINUTE`;

const buildSummaryQuery = (windowMinutes: number): string => `
SELECT
  countIf(event = '$pageview') AS pageviews,
  uniqIf(person_id, event = '$pageview') AS unique_visitors,
  countIf(event = '$web_vitals') AS web_vitals_events
FROM events
WHERE timestamp >= now() - INTERVAL ${formatWindow(windowMinutes)}
`;

const buildTopPathsQuery = (windowMinutes: number, limit: number): string => `
SELECT
  ${PATH_EXPRESSION} AS path,
  count() AS pageviews
FROM events
WHERE event = '$pageview'
  AND timestamp >= now() - INTERVAL ${formatWindow(windowMinutes)}
GROUP BY path
ORDER BY pageviews DESC
LIMIT ${Math.max(1, Math.trunc(limit))}
`;

const buildWebVitalsQuery = (
  metricProperty: "$performance_lcp" | "$performance_inp",
  alias: "lcp_p75_ms" | "inp_p75_ms",
  windowMinutes: number,
  limit: number,
): string => `
SELECT
  ${PATH_EXPRESSION} AS path,
  round(quantileIf(0.75)(toFloat(properties.${metricProperty}), properties.${metricProperty} IS NOT NULL), 1) AS ${alias},
  countIf(properties.${metricProperty} IS NOT NULL) AS samples
FROM events
WHERE event = '$web_vitals'
  AND timestamp >= now() - INTERVAL ${formatWindow(windowMinutes)}
GROUP BY path
HAVING samples > 0
ORDER BY ${alias} DESC
LIMIT ${Math.max(1, Math.trunc(limit))}
`;

const buildErrorSummaryQuery = (windowMinutes: number): string => `
SELECT
  countIf(event = '$exception') AS exception_events,
  uniqIf(
    coalesce(
      nullIf(toString(properties.$exception_issue_id), ''),
      nullIf(toString(properties.$exception_type), ''),
      nullIf(toString(properties.$exception_message), '')
    ),
    event = '$exception'
  ) AS distinct_exception_issues
FROM events
WHERE timestamp >= now() - INTERVAL ${formatWindow(windowMinutes)}
`;

const buildComparisonQuery = (windowMinutes: number): string => `
SELECT
  countIf(event = '$pageview' AND timestamp >= now() - INTERVAL ${formatWindow(windowMinutes)}) AS current_pageviews,
  countIf(
    event = '$pageview'
    AND timestamp < now() - INTERVAL ${formatWindow(windowMinutes)}
    AND timestamp >= now() - INTERVAL ${formatWindow(windowMinutes * 2)}
  ) AS previous_pageviews,
  countIf(event = '$web_vitals' AND timestamp >= now() - INTERVAL ${formatWindow(windowMinutes)}) AS current_web_vitals_events,
  countIf(
    event = '$web_vitals'
    AND timestamp < now() - INTERVAL ${formatWindow(windowMinutes)}
    AND timestamp >= now() - INTERVAL ${formatWindow(windowMinutes * 2)}
  ) AS previous_web_vitals_events,
  countIf(event = '$exception' AND timestamp >= now() - INTERVAL ${formatWindow(windowMinutes)}) AS current_exception_events,
  countIf(
    event = '$exception'
    AND timestamp < now() - INTERVAL ${formatWindow(windowMinutes)}
    AND timestamp >= now() - INTERVAL ${formatWindow(windowMinutes * 2)}
  ) AS previous_exception_events
FROM events
WHERE timestamp >= now() - INTERVAL ${formatWindow(windowMinutes * 2)}
`;

const readSummary = (row: Record<string, unknown> | undefined): PerformanceSummaryRow => ({
  pageviews: toNumber(row?.pageviews),
  uniqueVisitors: toNumber(row?.unique_visitors),
  webVitalsEvents: toNumber(row?.web_vitals_events),
});

const readErrorSummary = (row: Record<string, unknown> | undefined): ErrorSummaryRow => ({
  exceptionEvents: toNumber(row?.exception_events),
  distinctExceptionIssues: toNumber(row?.distinct_exception_issues),
});

const readComparison = (row: Record<string, unknown> | undefined): ComparisonRow => ({
  currentPageviews: toNumber(row?.current_pageviews),
  previousPageviews: toNumber(row?.previous_pageviews),
  currentWebVitalsEvents: toNumber(row?.current_web_vitals_events),
  previousWebVitalsEvents: toNumber(row?.previous_web_vitals_events),
  currentExceptionEvents: toNumber(row?.current_exception_events),
  previousExceptionEvents: toNumber(row?.previous_exception_events),
});

const readTopPaths = (rows: readonly Record<string, unknown>[]): PostHogDashboardTopPathRow[] => (
  rows.map((row) => ({
    path: toString(row.path),
    pageviews: toNumber(row.pageviews),
  }))
);

const readPerformanceRows = (
  rows: readonly Record<string, unknown>[],
  metricKey: "lcp_p75_ms" | "inp_p75_ms",
  slowThresholdMs: number,
): PostHogDashboardPerformanceRow[] => (
  rows.map((row) => {
    const valueMs = toNumber(row[metricKey]);
    return {
      path: toString(row.path),
      valueMs,
      samples: toNumber(row.samples),
      status: classifyMetric(valueMs, slowThresholdMs),
    };
  })
);

const computeDeltaPercent = (currentValue: number, previousValue: number): number | null => {
  if (previousValue <= 0) {
    return null;
  }

  return round(((currentValue - previousValue) / previousValue) * 100);
};

const buildAnomalies = (snapshot: {
  readonly pageviews: number;
  readonly webVitalsEvents: number;
  readonly exceptionEvents: number;
  readonly coverageRatio: number;
  readonly previousPageviews: number;
  readonly previousExceptionEvents: number;
  readonly lcp: readonly PostHogDashboardPerformanceRow[];
  readonly inp: readonly PostHogDashboardPerformanceRow[];
}): PostHogDashboardAnomaly[] => {
  const anomalies: PostHogDashboardAnomaly[] = [];
  const slowLcpRows = snapshot.lcp.filter((row) => row.status === "slow").slice(0, 3);
  const slowInpRows = snapshot.inp.filter((row) => row.status === "slow").slice(0, 3);

  if (snapshot.previousPageviews >= 20 && snapshot.pageviews <= snapshot.previousPageviews * 0.7) {
    anomalies.push({
      id: "traffic-drop",
      kind: "traffic-drop",
      severity: snapshot.pageviews <= snapshot.previousPageviews * 0.5 ? "critical" : "warning",
      title: "Traffic dropped materially",
      summary: `Pageviews fell from ${snapshot.previousPageviews} to ${snapshot.pageviews} in the latest window.`,
      metric: "pageviews",
      currentValue: snapshot.pageviews,
      previousValue: snapshot.previousPageviews,
      threshold: 30,
      path: null,
    });
  }

  if (
    snapshot.exceptionEvents >= 5
    && (
      snapshot.previousExceptionEvents === 0
      || snapshot.exceptionEvents >= snapshot.previousExceptionEvents * 2
    )
  ) {
    anomalies.push({
      id: "exception-spike",
      kind: "exception-spike",
      severity: snapshot.exceptionEvents >= Math.max(15, snapshot.previousExceptionEvents * 3) ? "critical" : "warning",
      title: "Exceptions are spiking",
      summary: `Exception volume rose to ${snapshot.exceptionEvents} from ${snapshot.previousExceptionEvents}.`,
      metric: "exception_events",
      currentValue: snapshot.exceptionEvents,
      previousValue: snapshot.previousExceptionEvents,
      threshold: 2,
      path: null,
    });
  }

  if (snapshot.coverageRatio < 0.3 && snapshot.pageviews >= 20) {
    anomalies.push({
      id: "weak-web-vitals-coverage",
      kind: "weak-web-vitals-coverage",
      severity: snapshot.coverageRatio < 0.15 ? "critical" : "warning",
      title: "Web vitals coverage is thin",
      summary: `Only ${round(snapshot.coverageRatio * 100)}% of pageviews included web vitals events.`,
      metric: "web_vitals_coverage_ratio",
      currentValue: round(snapshot.coverageRatio * 100),
      previousValue: null,
      threshold: 30,
      path: null,
    });
  }

  for (const row of slowLcpRows) {
    anomalies.push({
      id: `slow-lcp-${row.path}`,
      kind: "slow-lcp",
      severity: row.valueMs >= 4_000 ? "critical" : "warning",
      title: `Slow LCP on ${row.path}`,
      summary: `LCP p75 is ${row.valueMs}ms across ${row.samples} samples.`,
      metric: "lcp_p75_ms",
      currentValue: row.valueMs,
      previousValue: null,
      threshold: POSTHOG_PERFORMANCE_LCP_SLOW_THRESHOLD_MS,
      path: row.path,
    });
  }

  for (const row of slowInpRows) {
    anomalies.push({
      id: `slow-inp-${row.path}`,
      kind: "slow-inp",
      severity: row.valueMs >= 350 ? "critical" : "warning",
      title: `Slow INP on ${row.path}`,
      summary: `INP p75 is ${row.valueMs}ms across ${row.samples} samples.`,
      metric: "inp_p75_ms",
      currentValue: row.valueMs,
      previousValue: null,
      threshold: POSTHOG_PERFORMANCE_INP_SLOW_THRESHOLD_MS,
      path: row.path,
    });
  }

  return anomalies;
};

const computeProductionReadinessScore = (input: {
  readonly anomalies: readonly PostHogDashboardAnomaly[];
  readonly slowLcpPages: number;
  readonly slowInpPages: number;
  readonly coverageRatio: number;
  readonly pageviews: number;
}): number => {
  let score = 100;
  score -= input.slowLcpPages * 8;
  score -= input.slowInpPages * 8;

  for (const anomaly of input.anomalies) {
    score -= anomaly.severity === "critical" ? 16 : 8;
  }

  if (input.pageviews >= 20 && input.coverageRatio < 0.3) {
    score -= input.coverageRatio < 0.15 ? 12 : 6;
  }

  return clamp(Math.round(score), 0, 100);
};

export const buildPostHogDashboardSnapshot = async (
  input: BuildPostHogDashboardSnapshotInput,
): Promise<PostHogDashboardSnapshot> => {
  const windowMinutes = clamp(
    input.windowMinutes ?? POSTHOG_DASHBOARD_DEFAULT_WINDOW_MINUTES,
    5,
    1_440,
  );
  const topPathsLimit = clamp(
    input.topPathsLimit ?? POSTHOG_DASHBOARD_DEFAULT_TOP_PATHS_LIMIT,
    1,
    20,
  );

  const [
    summaryResult,
    topPathsResult,
    lcpResult,
    inpResult,
    errorSummaryResult,
    comparisonResult,
  ] = await Promise.all([
    input.runQuery(`performance_summary_${windowMinutes}m`, buildSummaryQuery(windowMinutes)),
    input.runQuery(`performance_top_paths_${windowMinutes}m`, buildTopPathsQuery(windowMinutes, topPathsLimit)),
    input.runQuery(
      `performance_lcp_${windowMinutes}m`,
      buildWebVitalsQuery("$performance_lcp", "lcp_p75_ms", windowMinutes, topPathsLimit),
    ),
    input.runQuery(
      `performance_inp_${windowMinutes}m`,
      buildWebVitalsQuery("$performance_inp", "inp_p75_ms", windowMinutes, topPathsLimit),
    ),
    input.runQuery(`performance_errors_${windowMinutes}m`, buildErrorSummaryQuery(windowMinutes)),
    input.runQuery(`performance_comparison_${windowMinutes}m`, buildComparisonQuery(windowMinutes)),
  ]);

  const summary = readSummary(summaryResult.results[0]);
  const errors = readErrorSummary(errorSummaryResult.results[0]);
  const comparison = readComparison(comparisonResult.results[0]);
  const topPaths = readTopPaths(topPathsResult.results);
  const lcp = readPerformanceRows(
    lcpResult.results,
    "lcp_p75_ms",
    POSTHOG_PERFORMANCE_LCP_SLOW_THRESHOLD_MS,
  );
  const inp = readPerformanceRows(
    inpResult.results,
    "inp_p75_ms",
    POSTHOG_PERFORMANCE_INP_SLOW_THRESHOLD_MS,
  );
  const coverageRatio = summary.pageviews > 0 ? round(summary.webVitalsEvents / summary.pageviews, 3) : 0;
  const errorRatePer1kPageviews = summary.pageviews > 0
    ? round((errors.exceptionEvents / summary.pageviews) * 1_000, 1)
    : 0;
  const slowLcpPages = lcp.filter((row) => row.status === "slow").length;
  const slowInpPages = inp.filter((row) => row.status === "slow").length;
  const anomalies = buildAnomalies({
    pageviews: summary.pageviews,
    webVitalsEvents: summary.webVitalsEvents,
    exceptionEvents: errors.exceptionEvents,
    coverageRatio,
    previousPageviews: comparison.previousPageviews,
    previousExceptionEvents: comparison.previousExceptionEvents,
    lcp,
    inp,
  });

  return {
    generatedAt: input.generatedAt ?? Date.now(),
    windowMinutes,
    summary: {
      pageviews: summary.pageviews,
      uniqueVisitors: summary.uniqueVisitors,
      webVitalsEvents: summary.webVitalsEvents,
      exceptionEvents: errors.exceptionEvents,
      distinctExceptionIssues: errors.distinctExceptionIssues,
      webVitalsCoverageRatio: coverageRatio,
      errorRatePer1kPageviews,
      slowLcpPages,
      slowInpPages,
      productionReadinessScore: computeProductionReadinessScore({
        anomalies,
        slowLcpPages,
        slowInpPages,
        coverageRatio,
        pageviews: summary.pageviews,
      }),
      anomalyCount: anomalies.length,
    },
    previousWindow: {
      pageviews: comparison.previousPageviews,
      webVitalsEvents: comparison.previousWebVitalsEvents,
      exceptionEvents: comparison.previousExceptionEvents,
      pageviewsDeltaPercent: computeDeltaPercent(summary.pageviews, comparison.previousPageviews),
      webVitalsDeltaPercent: computeDeltaPercent(summary.webVitalsEvents, comparison.previousWebVitalsEvents),
      exceptionDeltaPercent: computeDeltaPercent(errors.exceptionEvents, comparison.previousExceptionEvents),
    },
    topPaths,
    lcp,
    inp,
    anomalies,
  };
};
