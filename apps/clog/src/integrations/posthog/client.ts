import type { IntegrationHealthView, RuntimeObservation } from "@clog/types";
import type { PostHogRuntimeConfig } from "../../config";

export interface PostHogIntegrationClientConfig {
  readonly api?: unknown;
  readonly config: PostHogRuntimeConfig;
  readonly capabilities: {
    readonly canReadErrors: boolean;
  };
}

export class PostHogIntegrationClient {
  constructor(private readonly deps: PostHogIntegrationClientConfig) {}

  async listErrorObservations(): Promise<readonly RuntimeObservation[]> {
    if (!this.deps.capabilities.canReadErrors) {
      return [];
    }

    return [];
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
