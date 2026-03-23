import type { IntegrationHealthView, RuntimeObservation } from "@clog/types";

export class PostHogIntegrationClient {
  async describeHealth(): Promise<IntegrationHealthView> {
    return {
      kind: "posthog",
      status: "missing-config",
      summary: "PostHog client not wired yet. Replace this stub with project-scoped insight and error ingestion.",
      lastCheckedAt: Date.now(),
    };
  }

  async collectObservations(): Promise<RuntimeObservation[]> {
    return [
      {
        id: "obs_posthog_stub",
        kind: "runtime-health",
        source: {
          kind: "posthog",
          label: "PostHog",
        },
        summary: "PostHog ingestion stub is active.",
        details: "This placeholder stands in for insights, error tracking, recordings, flags, funnels, and anomaly polling.",
        severity: "info",
        detectedAt: Date.now(),
        metadata: {
          placeholder: true,
        },
      },
    ];
  }
}
