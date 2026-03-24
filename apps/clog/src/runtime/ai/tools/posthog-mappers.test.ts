import { describe, expect, test } from "bun:test";
import {
  mapInsightRegressionObservation,
  mapPostHogErrorSpikeObservation,
  mapPostHogMissingConfigObservation,
} from "./posthog-mappers";

describe("posthog mappers", () => {
  test("builds an error spike observation when thresholds are crossed", () => {
    const observation = mapPostHogErrorSpikeObservation({
      currentCount: 30,
      previousCount: 10,
      lookbackMinutes: 30,
      spikeThreshold: 10,
      spikeMultiplier: 2,
      criticalErrorThreshold: 25,
    });

    expect(observation).not.toBeNull();
    expect(observation?.kind).toBe("error-rate-spike");
    expect(observation?.severity).toBe("critical");
  });

  test("builds an insight regression observation from current and previous values", () => {
    const observation = mapInsightRegressionObservation(
      {
        name: "Checkout conversion",
        query: "SELECT 60 AS current_value, 100 AS previous_value",
        regressionThresholdPercent: 20,
        minimumPreviousValue: 10,
      },
      {
        current_value: 60,
        previous_value: 100,
      },
    );

    expect(observation).not.toBeNull();
    expect(observation?.kind).toBe("insight-regression");
    expect(observation?.summary).toContain("Checkout conversion");
  });

  test("builds a missing config runtime-health observation", () => {
    const observation = mapPostHogMissingConfigObservation([
      "POSTHOG_CLAW_POSTHOG_PROJECT_ID",
      "POSTHOG_CLAW_POSTHOG_PERSONAL_API_KEY",
    ]);

    expect(observation.kind).toBe("runtime-health");
    expect(observation.details).toContain("POSTHOG_CLAW_POSTHOG_PROJECT_ID");
  });
});
