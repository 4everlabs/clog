import type { IntegrationCapabilitySnapshot, IntegrationHealthView, RuntimeObservation } from "@clog/types";
import type { PostHogRuntimeConfig } from "../../config";
import { PostHogApiClient } from "./api-client";
import {
  mapInsightRegressionObservation,
  mapPostHogErrorSpikeObservation,
  mapPostHogMissingConfigObservation,
  mapPostHogRequestFailureObservation,
} from "./mappers";
import type { PostHogErrorWindowRow, PostHogInsightWindowRow } from "./types";

export interface PostHogIntegrationClientDependencies {
  readonly api: PostHogApiClient;
  readonly config: PostHogRuntimeConfig;
  readonly capabilities: IntegrationCapabilitySnapshot["posthog"];
}

export class PostHogIntegrationClient {
  constructor(private readonly deps: PostHogIntegrationClientDependencies) {}

  async describeHealth(): Promise<IntegrationHealthView> {
    const access = await this.deps.api.describeAccess();
    return {
      kind: "posthog",
      status: access.ok ? "ready" : (this.deps.api.getMissingConfiguration().length > 0 ? "missing-config" : "degraded"),
      summary: access.summary,
      lastCheckedAt: access.checkedAt,
    };
  }

  async collectObservations(): Promise<RuntimeObservation[]> {
    const observations: RuntimeObservation[] = [];
    const missing = this.deps.api.getMissingConfiguration();
    if (missing.length > 0) {
      observations.push(mapPostHogMissingConfigObservation(missing));
      return observations;
    }

    if (this.deps.capabilities.canReadErrors) {
      observations.push(...await this.listErrorObservations());
    }

    if (this.deps.capabilities.canReadInsights) {
      observations.push(...await this.listInsightObservations());
    }

    if (this.deps.capabilities.canReadFlags && this.deps.config.enableFlags) {
      try {
        await this.deps.api.listFeatureFlags();
      } catch (error) {
        observations.push(mapPostHogRequestFailureObservation("feature flag listing", error));
      }
    }

    return observations;
  }

  async listErrorObservations(): Promise<RuntimeObservation[]> {
    try {
      const response = await this.deps.api.queryHogQL<PostHogErrorWindowRow>(
        "clog-posthog-error-window",
        this.buildErrorWindowQuery(),
      );
      const observation = mapPostHogErrorSpikeObservation({
        currentCount: response.results[0]?.current_count,
        previousCount: response.results[0]?.previous_count,
        lookbackMinutes: this.deps.config.errorLookbackMinutes,
        spikeThreshold: this.deps.config.errorSpikeThreshold,
        spikeMultiplier: this.deps.config.errorSpikeMultiplier,
        criticalErrorThreshold: this.deps.config.criticalErrorThreshold,
      });
      return observation ? [observation] : [];
    } catch (error) {
      return [mapPostHogRequestFailureObservation("error monitoring", error)];
    }
  }

  async listInsightObservations(): Promise<RuntimeObservation[]> {
    const observations: RuntimeObservation[] = [];

    for (const monitor of this.deps.config.insightMonitors) {
      try {
        const response = await this.deps.api.queryHogQL<PostHogInsightWindowRow>(
          `clog-posthog-insight-${monitor.name}`,
          monitor.query,
        );
        const observation = mapInsightRegressionObservation(monitor, response.results[0]);
        if (observation) {
          observations.push(observation);
        }
      } catch (error) {
        observations.push(mapPostHogRequestFailureObservation(`insight monitor "${monitor.name}"`, error));
      }
    }

    return observations;
  }

  private buildErrorWindowQuery(): string {
    const lookback = this.deps.config.errorLookbackMinutes;
    const fullWindow = lookback * 2;

    return [
      "SELECT",
      `  countIf(timestamp >= now() - INTERVAL ${lookback} MINUTE) AS current_count,`,
      `  countIf(timestamp >= now() - INTERVAL ${fullWindow} MINUTE AND timestamp < now() - INTERVAL ${lookback} MINUTE) AS previous_count`,
      "FROM events",
      "WHERE event = '$exception'",
    ].join("\n");
  }
}
