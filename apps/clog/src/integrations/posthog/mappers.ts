import type { FindingSeverity, RuntimeObservation } from "@clog/types";
import type { PostHogInsightMonitorConfig } from "../../config";

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const createRuntimeHealthObservation = (
  id: string,
  summary: string,
  details: string,
  severity: FindingSeverity = "warning",
  metadata?: Record<string, unknown>,
): RuntimeObservation => ({
  id,
  kind: "runtime-health",
  source: {
    kind: "posthog",
    label: "PostHog",
  },
  summary,
  details,
  severity,
  detectedAt: Date.now(),
  metadata,
});

export const mapPostHogMissingConfigObservation = (missing: readonly string[]): RuntimeObservation =>
  createRuntimeHealthObservation(
    "obs_posthog_missing_config",
    "PostHog monitoring is configured incompletely.",
    `Set the missing environment variables before enabling PostHog reads: ${missing.join(", ")}.`,
    "warning",
    { missing },
  );

export const mapPostHogRequestFailureObservation = (operation: string, error: unknown): RuntimeObservation =>
  createRuntimeHealthObservation(
    `obs_posthog_failure_${slugify(operation)}`,
    `PostHog ${operation} failed.`,
    error instanceof Error ? error.message : "Unknown PostHog request failure",
    "warning",
    { operation },
  );

export const mapPostHogErrorSpikeObservation = (input: {
  readonly currentCount: unknown;
  readonly previousCount: unknown;
  readonly lookbackMinutes: number;
  readonly spikeThreshold: number;
  readonly spikeMultiplier: number;
  readonly criticalErrorThreshold: number;
}): RuntimeObservation | null => {
  const currentCount = toFiniteNumber(input.currentCount);
  const previousCount = toFiniteNumber(input.previousCount);

  if (currentCount === null || previousCount === null) {
    return createRuntimeHealthObservation(
      "obs_posthog_error_query_shape_invalid",
      "PostHog error-rate query returned an unexpected result shape.",
      "Expected current_count and previous_count columns from the exception monitoring query.",
      "warning",
    );
  }

  const ratio = previousCount > 0 ? currentCount / previousCount : currentCount;
  const aboveThreshold = currentCount >= input.spikeThreshold;
  const isCritical = currentCount >= input.criticalErrorThreshold;
  const isSpike = previousCount === 0 ? aboveThreshold : aboveThreshold && ratio >= input.spikeMultiplier;

  if (!isCritical && !isSpike) {
    return null;
  }

  const severity: FindingSeverity = isCritical ? "critical" : "warning";
  const ratioText = previousCount > 0 ? `${ratio.toFixed(2)}x` : "new burst";

  return {
    id: `obs_posthog_error_spike_${input.lookbackMinutes}m`,
    kind: "error-rate-spike",
    source: {
      kind: "posthog",
      label: "PostHog Error Tracking",
      referenceId: `posthog-errors-${input.lookbackMinutes}m`,
    },
    summary: `PostHog exception volume is elevated in the last ${input.lookbackMinutes} minutes.`,
    details: `Current exception count is ${currentCount}, previous window count is ${previousCount}, and the change ratio is ${ratioText}.`,
    severity,
    detectedAt: Date.now(),
    metadata: {
      currentCount,
      previousCount,
      ratio,
      lookbackMinutes: input.lookbackMinutes,
    },
  };
};

export const mapInsightRegressionObservation = (
  monitor: PostHogInsightMonitorConfig,
  row: Record<string, unknown> | undefined,
): RuntimeObservation | null => {
  if (!row) {
    return null;
  }

  const currentValue = toFiniteNumber(row.current_value);
  const previousValue = toFiniteNumber(row.previous_value);

  if (currentValue === null || previousValue === null) {
    return createRuntimeHealthObservation(
      `obs_posthog_insight_shape_${slugify(monitor.name)}`,
      `PostHog insight monitor "${monitor.name}" returned an unexpected result shape.`,
      "Expected current_value and previous_value columns from the configured insight query.",
      "warning",
      { monitor: monitor.name },
    );
  }

  if (previousValue < monitor.minimumPreviousValue || currentValue >= previousValue) {
    return null;
  }

  const regressionPercent = ((previousValue - currentValue) / previousValue) * 100;
  if (regressionPercent < monitor.regressionThresholdPercent) {
    return null;
  }

  const severity: FindingSeverity = regressionPercent >= monitor.regressionThresholdPercent * 2 ? "critical" : "warning";

  return {
    id: `obs_posthog_insight_${slugify(monitor.name)}`,
    kind: "insight-regression",
    source: {
      kind: "posthog",
      label: "PostHog Insight",
      referenceId: monitor.name,
    },
    summary: `PostHog insight "${monitor.name}" regressed by ${regressionPercent.toFixed(1)}%.`,
    details: `The current value is ${currentValue} and the previous comparison value is ${previousValue}. The configured regression threshold is ${monitor.regressionThresholdPercent}%.`,
    severity,
    detectedAt: Date.now(),
    metadata: {
      currentValue,
      previousValue,
      regressionPercent,
      thresholdPercent: monitor.regressionThresholdPercent,
      monitor: monitor.name,
    },
  };
};
