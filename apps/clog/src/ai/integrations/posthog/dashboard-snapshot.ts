import type { PostHogInsightQueryResult } from "@clog/types";

export const POSTHOG_DASHBOARD_DEFAULT_WINDOW_MINUTES = 60;
export const POSTHOG_DASHBOARD_DEFAULT_TOP_PATHS_LIMIT = 10;
export const POSTHOG_PERFORMANCE_LCP_SLOW_THRESHOLD_MS = 2_500;
export const POSTHOG_PERFORMANCE_INP_SLOW_THRESHOLD_MS = 200;
export const POSTHOG_PERFORMANCE_FCP_SLOW_THRESHOLD_MS = 1_800;
export const POSTHOG_PERFORMANCE_CLS_SLOW_THRESHOLD = 0.1;
const POSTHOG_PERFORMANCE_LCP_CRITICAL_THRESHOLD_MS = 4_000;
const POSTHOG_PERFORMANCE_INP_CRITICAL_THRESHOLD_MS = 500;
const POSTHOG_PERFORMANCE_FCP_CRITICAL_THRESHOLD_MS = 3_000;
const POSTHOG_PERFORMANCE_CLS_CRITICAL_THRESHOLD = 0.25;
const MINUTE_IN_MS = 60_000;

const PATH_EXPRESSION = "coalesce(nullIf(properties.$pathname, ''), nullIf(properties.$current_url, ''), '<unknown>')";

export interface PostHogDashboardPerformanceRow {
  readonly path: string;
  readonly value: number;
  readonly unit: "ms" | "score";
  readonly samples: number;
  readonly status: "good" | "slow";
}

export interface PostHogDashboardTopPathRow {
  readonly path: string;
  readonly pageviews: number;
}

export interface PostHogDashboardAnomaly {
  readonly id: string;
  readonly kind:
    | "traffic-drop"
    | "exception-spike"
    | "slow-lcp"
    | "slow-inp"
    | "slow-fcp"
    | "slow-cls"
    | "weak-web-vitals-coverage";
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
  readonly windowStartAt: number;
  readonly windowEndAt: number;
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
    readonly slowFcpPages: number;
    readonly slowClsPages: number;
    readonly productionReadinessScore: number;
    readonly anomalyCount: number;
  };
  readonly previousWindow: {
    readonly pageviews: number;
    readonly uniqueVisitors: number;
    readonly webVitalsEvents: number;
    readonly exceptionEvents: number;
    readonly distinctExceptionIssues: number;
    readonly pageviewsDeltaPercent: number | null;
    readonly uniqueVisitorsDeltaPercent: number | null;
    readonly webVitalsDeltaPercent: number | null;
    readonly exceptionDeltaPercent: number | null;
    readonly distinctExceptionIssuesDeltaPercent: number | null;
  };
  readonly topPaths: readonly PostHogDashboardTopPathRow[];
  readonly lcp: readonly PostHogDashboardPerformanceRow[];
  readonly inp: readonly PostHogDashboardPerformanceRow[];
  readonly fcp: readonly PostHogDashboardPerformanceRow[];
  readonly cls: readonly PostHogDashboardPerformanceRow[];
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
  readonly currentUniqueVisitors: number;
  readonly previousUniqueVisitors: number;
  readonly currentWebVitalsEvents: number;
  readonly previousWebVitalsEvents: number;
  readonly currentExceptionEvents: number;
  readonly previousExceptionEvents: number;
  readonly currentDistinctExceptionIssues: number;
  readonly previousDistinctExceptionIssues: number;
}

export interface BuildPostHogDashboardSnapshotInput {
  readonly generatedAt?: number;
  readonly windowEndAt?: number;
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

const formatTimestampExpression = (timestampMs: number): string => `toDateTime(${Math.trunc(timestampMs / 1_000)})`;

const buildTimeRangePredicate = (startAt: number, endAt: number): string => (
  `timestamp >= ${formatTimestampExpression(startAt)} AND timestamp < ${formatTimestampExpression(endAt)}`
);

const buildSummaryQuery = (windowStartAt: number, windowEndAt: number): string => `
SELECT
  countIf(event = '$pageview') AS pageviews,
  uniqIf(person_id, event = '$pageview') AS unique_visitors,
  countIf(event = '$web_vitals') AS web_vitals_events
FROM events
WHERE ${buildTimeRangePredicate(windowStartAt, windowEndAt)}
`;

const buildTopPathsQuery = (windowStartAt: number, windowEndAt: number, limit: number): string => `
SELECT
  ${PATH_EXPRESSION} AS path,
  count() AS pageviews
FROM events
WHERE event = '$pageview'
  AND ${buildTimeRangePredicate(windowStartAt, windowEndAt)}
GROUP BY path
ORDER BY pageviews DESC
LIMIT ${Math.max(1, Math.trunc(limit))}
`;

const buildWebVitalsQuery = (
  metricProperty:
    | "$web_vitals_LCP_value"
    | "$web_vitals_INP_value"
    | "$web_vitals_FCP_value"
    | "$web_vitals_CLS_value",
  alias: "lcp_value" | "inp_value" | "fcp_value" | "cls_value",
  windowStartAt: number,
  windowEndAt: number,
  limit: number,
): string => `
SELECT
  ${PATH_EXPRESSION} AS path,
  round(quantileIf(0.75)(toFloat(properties.${metricProperty}), properties.${metricProperty} IS NOT NULL), 3) AS ${alias},
  countIf(properties.${metricProperty} IS NOT NULL) AS samples
FROM events
WHERE event = '$web_vitals'
  AND ${buildTimeRangePredicate(windowStartAt, windowEndAt)}
GROUP BY path
HAVING samples > 0
ORDER BY ${alias} DESC
LIMIT ${Math.max(1, Math.trunc(limit))}
`;

const buildExceptionIssueExpression = (): string => `
coalesce(
  nullIf(toString(properties.$exception_issue_id), ''),
  nullIf(toString(properties.$exception_type), ''),
  nullIf(toString(properties.$exception_message), '')
)
`;

const buildErrorSummaryQuery = (windowStartAt: number, windowEndAt: number): string => `
SELECT
  countIf(event = '$exception') AS exception_events,
  uniqIf(
    ${buildExceptionIssueExpression()},
    event = '$exception'
  ) AS distinct_exception_issues
FROM events
WHERE ${buildTimeRangePredicate(windowStartAt, windowEndAt)}
`;

const buildComparisonQuery = (windowStartAt: number, windowEndAt: number): string => {
  const windowDurationMs = Math.max(MINUTE_IN_MS, windowEndAt - windowStartAt);
  const previousWindowStartAt = windowStartAt - windowDurationMs;
  const currentRange = buildTimeRangePredicate(windowStartAt, windowEndAt);
  const previousRange = buildTimeRangePredicate(previousWindowStartAt, windowStartAt);

  return `
SELECT
  countIf(event = '$pageview' AND ${currentRange}) AS current_pageviews,
  countIf(event = '$pageview' AND ${previousRange}) AS previous_pageviews,
  uniqIf(person_id, event = '$pageview' AND ${currentRange}) AS current_unique_visitors,
  uniqIf(person_id, event = '$pageview' AND ${previousRange}) AS previous_unique_visitors,
  countIf(event = '$web_vitals' AND ${currentRange}) AS current_web_vitals_events,
  countIf(event = '$web_vitals' AND ${previousRange}) AS previous_web_vitals_events,
  countIf(event = '$exception' AND ${currentRange}) AS current_exception_events,
  countIf(event = '$exception' AND ${previousRange}) AS previous_exception_events,
  uniqIf(${buildExceptionIssueExpression()}, event = '$exception' AND ${currentRange}) AS current_distinct_exception_issues,
  uniqIf(${buildExceptionIssueExpression()}, event = '$exception' AND ${previousRange}) AS previous_distinct_exception_issues
FROM events
WHERE ${buildTimeRangePredicate(previousWindowStartAt, windowEndAt)}
`;
};

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
  currentUniqueVisitors: toNumber(row?.current_unique_visitors),
  previousUniqueVisitors: toNumber(row?.previous_unique_visitors),
  currentWebVitalsEvents: toNumber(row?.current_web_vitals_events),
  previousWebVitalsEvents: toNumber(row?.previous_web_vitals_events),
  currentExceptionEvents: toNumber(row?.current_exception_events),
  previousExceptionEvents: toNumber(row?.previous_exception_events),
  currentDistinctExceptionIssues: toNumber(row?.current_distinct_exception_issues),
  previousDistinctExceptionIssues: toNumber(row?.previous_distinct_exception_issues),
});

const readTopPaths = (rows: readonly Record<string, unknown>[]): PostHogDashboardTopPathRow[] => (
  rows.map((row) => ({
    path: toString(row.path),
    pageviews: toNumber(row.pageviews),
  }))
);

const readPerformanceRows = (
  rows: readonly Record<string, unknown>[],
  metricKey: "lcp_value" | "inp_value" | "fcp_value" | "cls_value",
  slowThresholdMs: number,
  unit: "ms" | "score",
): PostHogDashboardPerformanceRow[] => (
  rows.map((row) => {
    const value = toNumber(row[metricKey]);
    return {
      path: toString(row.path),
      value,
      unit,
      samples: toNumber(row.samples),
      status: classifyMetric(value, slowThresholdMs),
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
  readonly fcp: readonly PostHogDashboardPerformanceRow[];
  readonly cls: readonly PostHogDashboardPerformanceRow[];
}): PostHogDashboardAnomaly[] => {
  const anomalies: PostHogDashboardAnomaly[] = [];
  const slowLcpRows = snapshot.lcp.filter((row) => row.status === "slow").slice(0, 3);
  const slowInpRows = snapshot.inp.filter((row) => row.status === "slow").slice(0, 3);
  const slowFcpRows = snapshot.fcp.filter((row) => row.status === "slow").slice(0, 3);
  const slowClsRows = snapshot.cls.filter((row) => row.status === "slow").slice(0, 3);

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
      severity: row.value >= POSTHOG_PERFORMANCE_LCP_CRITICAL_THRESHOLD_MS ? "critical" : "warning",
      title: `Slow LCP on ${row.path}`,
      summary: `LCP p75 is ${row.value}ms across ${row.samples} samples.`,
      metric: "lcp_p75_ms",
      currentValue: row.value,
      previousValue: null,
      threshold: POSTHOG_PERFORMANCE_LCP_SLOW_THRESHOLD_MS,
      path: row.path,
    });
  }

  for (const row of slowInpRows) {
    anomalies.push({
      id: `slow-inp-${row.path}`,
      kind: "slow-inp",
      severity: row.value >= POSTHOG_PERFORMANCE_INP_CRITICAL_THRESHOLD_MS ? "critical" : "warning",
      title: `Slow INP on ${row.path}`,
      summary: `INP p75 is ${row.value}ms across ${row.samples} samples.`,
      metric: "inp_p75_ms",
      currentValue: row.value,
      previousValue: null,
      threshold: POSTHOG_PERFORMANCE_INP_SLOW_THRESHOLD_MS,
      path: row.path,
    });
  }

  for (const row of slowFcpRows) {
    anomalies.push({
      id: `slow-fcp-${row.path}`,
      kind: "slow-fcp",
      severity: row.value >= POSTHOG_PERFORMANCE_FCP_CRITICAL_THRESHOLD_MS ? "critical" : "warning",
      title: `Slow FCP on ${row.path}`,
      summary: `FCP p75 is ${row.value}ms across ${row.samples} samples.`,
      metric: "fcp_p75_ms",
      currentValue: row.value,
      previousValue: null,
      threshold: POSTHOG_PERFORMANCE_FCP_SLOW_THRESHOLD_MS,
      path: row.path,
    });
  }

  for (const row of slowClsRows) {
    anomalies.push({
      id: `slow-cls-${row.path}`,
      kind: "slow-cls",
      severity: row.value >= POSTHOG_PERFORMANCE_CLS_CRITICAL_THRESHOLD ? "critical" : "warning",
      title: `High CLS on ${row.path}`,
      summary: `CLS p75 is ${row.value} across ${row.samples} samples.`,
      metric: "cls_p75_score",
      currentValue: row.value,
      previousValue: null,
      threshold: POSTHOG_PERFORMANCE_CLS_SLOW_THRESHOLD,
      path: row.path,
    });
  }

  return anomalies;
};

const computeProductionReadinessScore = (input: {
  readonly anomalies: readonly PostHogDashboardAnomaly[];
  readonly slowLcpPages: number;
  readonly slowInpPages: number;
  readonly slowFcpPages: number;
  readonly slowClsPages: number;
  readonly coverageRatio: number;
  readonly pageviews: number;
}): number => {
  let score = 100;
  score -= input.slowLcpPages * 8;
  score -= input.slowInpPages * 8;
  score -= input.slowFcpPages * 6;
  score -= input.slowClsPages * 6;

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
  const generatedAt = input.generatedAt ?? Date.now();
  const windowEndAt = input.windowEndAt ?? generatedAt;
  const windowStartAt = windowEndAt - (windowMinutes * MINUTE_IN_MS);

  const [
    summaryResult,
    topPathsResult,
    lcpResult,
    inpResult,
    fcpResult,
    clsResult,
    errorSummaryResult,
    comparisonResult,
  ] = await Promise.all([
    input.runQuery(`performance_summary_${windowMinutes}m`, buildSummaryQuery(windowStartAt, windowEndAt)),
    input.runQuery(`performance_top_paths_${windowMinutes}m`, buildTopPathsQuery(windowStartAt, windowEndAt, topPathsLimit)),
    input.runQuery(
      `performance_lcp_${windowMinutes}m`,
      buildWebVitalsQuery("$web_vitals_LCP_value", "lcp_value", windowStartAt, windowEndAt, topPathsLimit),
    ),
    input.runQuery(
      `performance_inp_${windowMinutes}m`,
      buildWebVitalsQuery("$web_vitals_INP_value", "inp_value", windowStartAt, windowEndAt, topPathsLimit),
    ),
    input.runQuery(
      `performance_fcp_${windowMinutes}m`,
      buildWebVitalsQuery("$web_vitals_FCP_value", "fcp_value", windowStartAt, windowEndAt, topPathsLimit),
    ),
    input.runQuery(
      `performance_cls_${windowMinutes}m`,
      buildWebVitalsQuery("$web_vitals_CLS_value", "cls_value", windowStartAt, windowEndAt, topPathsLimit),
    ),
    input.runQuery(`performance_errors_${windowMinutes}m`, buildErrorSummaryQuery(windowStartAt, windowEndAt)),
    input.runQuery(`performance_comparison_${windowMinutes}m`, buildComparisonQuery(windowStartAt, windowEndAt)),
  ]);

  const summary = readSummary(summaryResult.results[0]);
  const errors = readErrorSummary(errorSummaryResult.results[0]);
  const comparison = readComparison(comparisonResult.results[0]);
  const topPaths = readTopPaths(topPathsResult.results);
  const lcp = readPerformanceRows(
    lcpResult.results,
    "lcp_value",
    POSTHOG_PERFORMANCE_LCP_SLOW_THRESHOLD_MS,
    "ms",
  );
  const inp = readPerformanceRows(
    inpResult.results,
    "inp_value",
    POSTHOG_PERFORMANCE_INP_SLOW_THRESHOLD_MS,
    "ms",
  );
  const fcp = readPerformanceRows(
    fcpResult.results,
    "fcp_value",
    POSTHOG_PERFORMANCE_FCP_SLOW_THRESHOLD_MS,
    "ms",
  );
  const cls = readPerformanceRows(
    clsResult.results,
    "cls_value",
    POSTHOG_PERFORMANCE_CLS_SLOW_THRESHOLD,
    "score",
  );
  const coverageRatio = summary.pageviews > 0 ? round(summary.webVitalsEvents / summary.pageviews, 3) : 0;
  const errorRatePer1kPageviews = summary.pageviews > 0
    ? round((errors.exceptionEvents / summary.pageviews) * 1_000, 1)
    : 0;
  const slowLcpPages = lcp.filter((row) => row.status === "slow").length;
  const slowInpPages = inp.filter((row) => row.status === "slow").length;
  const slowFcpPages = fcp.filter((row) => row.status === "slow").length;
  const slowClsPages = cls.filter((row) => row.status === "slow").length;
  const anomalies = buildAnomalies({
    pageviews: summary.pageviews,
    webVitalsEvents: summary.webVitalsEvents,
    exceptionEvents: errors.exceptionEvents,
    coverageRatio,
    previousPageviews: comparison.previousPageviews,
    previousExceptionEvents: comparison.previousExceptionEvents,
    lcp,
    inp,
    fcp,
    cls,
  });

  return {
    generatedAt,
    windowMinutes,
    windowStartAt,
    windowEndAt,
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
      slowFcpPages,
      slowClsPages,
      productionReadinessScore: computeProductionReadinessScore({
        anomalies,
        slowLcpPages,
        slowInpPages,
        slowFcpPages,
        slowClsPages,
        coverageRatio,
        pageviews: summary.pageviews,
      }),
      anomalyCount: anomalies.length,
    },
    previousWindow: {
      pageviews: comparison.previousPageviews,
      uniqueVisitors: comparison.previousUniqueVisitors,
      webVitalsEvents: comparison.previousWebVitalsEvents,
      exceptionEvents: comparison.previousExceptionEvents,
      distinctExceptionIssues: comparison.previousDistinctExceptionIssues,
      pageviewsDeltaPercent: computeDeltaPercent(summary.pageviews, comparison.previousPageviews),
      uniqueVisitorsDeltaPercent: computeDeltaPercent(summary.uniqueVisitors, comparison.previousUniqueVisitors),
      webVitalsDeltaPercent: computeDeltaPercent(summary.webVitalsEvents, comparison.previousWebVitalsEvents),
      exceptionDeltaPercent: computeDeltaPercent(errors.exceptionEvents, comparison.previousExceptionEvents),
      distinctExceptionIssuesDeltaPercent: computeDeltaPercent(
        errors.distinctExceptionIssues,
        comparison.previousDistinctExceptionIssues,
      ),
    },
    topPaths,
    lcp,
    inp,
    fcp,
    cls,
    anomalies,
  };
};
