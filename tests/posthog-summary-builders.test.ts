import { describe, expect, test } from "bun:test";
import type { PostHogDashboardSnapshot } from "../apps/clog/src/ai/integrations/posthog/dashboard-snapshot";
import {
  buildPostHogAssetSummary,
  buildPostHogHealthSummary,
  buildPostHogReleaseSummary,
  buildPostHogUserFunnelSummary,
} from "../apps/clog/src/ai/integrations/posthog/summary-builders";
import type { PostHogUserFunnelSnapshot } from "../apps/clog/src/ai/integrations/posthog/user-funnel-snapshot";

const dashboardFixture = (): PostHogDashboardSnapshot => ({
  generatedAt: 1_700_000_000_000,
  windowMinutes: 60,
  windowStartAt: 1_699_999_640_000,
  windowEndAt: 1_700_000_000_000,
  summary: {
    pageviews: 100,
    uniqueVisitors: 40,
    webVitalsEvents: 20,
    exceptionEvents: 2,
    distinctExceptionIssues: 1,
    webVitalsCoverageRatio: 0.5,
    errorRatePer1kPageviews: 5,
    slowLcpPages: 1,
    slowInpPages: 0,
    slowFcpPages: 0,
    slowClsPages: 0,
    productionReadinessScore: 82,
    anomalyCount: 1,
  },
  previousWindow: {
    pageviews: 120,
    uniqueVisitors: 48,
    webVitalsEvents: 25,
    exceptionEvents: 1,
    distinctExceptionIssues: 1,
    pageviewsDeltaPercent: -16.7,
    uniqueVisitorsDeltaPercent: -16.7,
    webVitalsDeltaPercent: -20,
    exceptionDeltaPercent: 100,
    distinctExceptionIssuesDeltaPercent: 0,
  },
  topPaths: [{ path: "/", pageviews: 50 }],
  lcp: [],
  inp: [],
  fcp: [],
  cls: [],
  anomalies: [{
    id: "a1",
    kind: "traffic-drop",
    severity: "warning",
    title: "Traffic dipped",
    summary: "Drop vs prior window",
    metric: "pageviews",
    currentValue: 100,
    previousValue: 120,
    threshold: 10,
    path: "/",
  }],
});

const userFunnelFixture = (): PostHogUserFunnelSnapshot => ({
  generatedAt: 1_700_000_000_000,
  toplineWindowMinutes: 60,
  funnelWindowDays: 7,
  topline: {
    homepageUniqueVisitors: 12,
    newProfilesStarted: 4,
  },
  funnel: {
    steps: [
      {
        id: "homepage",
        label: "Homepage visited",
        count: 12,
        conversionFromPreviousRatio: null,
        dropoffFromPreviousCount: null,
        dropoffFromPreviousRatio: null,
      },
      {
        id: "auth",
        label: "Auth completed",
        count: 6,
        conversionFromPreviousRatio: 50,
        dropoffFromPreviousCount: 6,
        dropoffFromPreviousRatio: 50,
      },
    ],
    biggestDropoff: {
      fromStepId: "homepage",
      fromLabel: "Homepage visited",
      toStepId: "auth",
      toLabel: "Auth completed",
      dropoffUsers: 6,
      dropoffRatio: 50,
    },
    paymentStepUsers: 3,
    checkoutStartedUsers: 2,
    paidConversionUsers: 1,
    branches: {
      freeTier: {
        label: "Free tier picked",
        count: null,
        conversionFromPaymentStepRatio: null,
        instrumented: false,
        note: "Missing source-of-truth signal.",
      },
      core: {
        label: "Core checkout started",
        count: 2,
        conversionFromPaymentStepRatio: 66.7,
        instrumented: true,
        note: "Core maps to planKey='pro'.",
      },
      pro: {
        label: "Pro checkout started",
        count: 0,
        conversionFromPaymentStepRatio: 0,
        instrumented: true,
        note: "Pro maps to planKey='ultra'.",
      },
    },
  },
  instrumentationWarnings: [
    "No canonical free-tier pick signal is currently instrumented in PostHog.",
  ],
});

describe("PostHog summary builders", () => {
  test("buildPostHogHealthSummary carries dashboard and monitoring signals into printout", () => {
    const summary = buildPostHogHealthSummary(dashboardFixture(), {
      latestPerformanceReport: { summary: { productionReadinessScore: 91 } },
      recentPostHogOperations: [
        { operation: "dashboardSnapshot", lastRecordedAt: 99 },
      ],
    }, {
      context: "checkout",
      timeRange: {
        preset: "last_hour",
        windowMinutes: 60,
        label: "last hour",
      },
    });

    expect(summary.generatedAt).toBe(1_700_000_000_000);
    expect(summary.context).toBe("checkout");
    expect(summary.timeRange).toEqual({
      preset: "last_hour",
      windowMinutes: 60,
      label: "last hour",
    });
    expect(summary.dashboard.productionReadinessScore).toBe(82);
    expect(summary.dashboard.topAnomalies).toEqual([{ title: "Traffic dipped", severity: "warning" }]);
    expect(summary.monitoring.latestProductionReadinessScore).toBe(91);
    expect(summary.monitoring.operations[0]?.operation).toBe("dashboardSnapshot");
    expect(summary.printout).toContain("Production readiness: 82/100");
    expect(summary.printout).toContain("Latest performance report score: 91/100");
  });

  test("buildPostHogAssetSummary formats compact asset rows", () => {
    const summary = buildPostHogAssetSummary({
      dashboards: [{ id: "d1", name: "Overview" }],
      insights: [{ id: "i1", name: "Funnel" }],
      entityHits: [{ id: "e1", type: "insight", name: "Funnel" }],
      schemaEntities: [{ name: "purchase", kind: "event" }],
      totals: {
        dashboardsListed: 5,
        insightsListed: 12,
        entityHits: 1,
        schemaEntities: 1,
      },
    }, 2, {
      context: "pricing",
    });

    expect(summary.generatedAt).toBe(2);
    expect(summary.context).toBe("pricing");
    expect(summary.timeRange.label).toBeNull();
    expect(summary.totals.insightsListed).toBe(12);
    expect(summary.printout).toContain("Overview [d1]");
    expect(summary.printout).toContain("purchase (event)");
  });

  test("buildPostHogReleaseSummary stitches flags, experiments, and observations", () => {
    const summary = buildPostHogReleaseSummary({
      flags: [{
        key: "checkout",
        name: "checkout",
        active: true,
        rolloutPercentage: 50,
        status: "active",
      }],
      experiments: [{
        id: "exp1",
        name: "Pricing test",
        status: "running",
        featureFlagKey: "checkout",
      }],
      errorObservations: [{
        id: "obs1",
        severity: "warning",
        summary: "Elevated errors",
      }],
      logAttributes: [{ key: "service", type: "string" }],
      totals: {
        flags: 20,
        experiments: 3,
        errorObservations: 1,
        logAttributes: 10,
      },
    }, 3, {
      timeRange: {
        preset: "last_24_hours",
        windowMinutes: 1_440,
        label: "last 24 hours",
      },
    });

    expect(summary.generatedAt).toBe(3);
    expect(summary.timeRange.windowMinutes).toBe(1_440);
    expect(summary.flags[0]?.key).toBe("checkout");
    expect(summary.printout).toContain("Pricing test");
    expect(summary.printout).toContain("Elevated errors");
  });

  test("buildPostHogUserFunnelSummary formats topline, drop-off, and instrumentation warnings", () => {
    const summary = buildPostHogUserFunnelSummary(userFunnelFixture(), {
      context: "landing-to-paid",
      toplineTimeRange: {
        preset: "last_hour",
        windowMinutes: 60,
        label: "last hour",
      },
      funnelTimeRange: {
        preset: null,
        windowMinutes: 10_080,
        label: "last 7 days",
      },
    });

    expect(summary.context).toBe("landing-to-paid");
    expect(summary.topline.homepageUniqueVisitors).toBe(12);
    expect(summary.funnel.biggestDropoff?.dropoffUsers).toBe(6);
    expect(summary.printout).toContain("Topline (last hour): 12 homepage visitors, 4 profile starts");
    expect(summary.printout).toContain("Biggest drop-off: Homepage visited -> Auth completed lost 6 users");
    expect(summary.printout).toContain("Free tier missing instrumentation");
  });
});
