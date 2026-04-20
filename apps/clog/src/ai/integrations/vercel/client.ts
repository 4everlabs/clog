import type { IntegrationHealthView } from "@clog/types";

export interface VercelIntegrationClientConfig {
  readonly enabled: boolean;
}

export class VercelIntegrationClient {
  constructor(private readonly config: VercelIntegrationClientConfig) {}

  async getHealth(): Promise<IntegrationHealthView> {
    if (!this.config.enabled) {
      return {
        kind: "vercel",
        status: "disabled",
        summary: "Vercel integration is disabled.",
        lastCheckedAt: Date.now(),
      };
    }

    return {
      kind: "vercel",
      status: "degraded",
      summary: "Vercel integration is enabled but still a stub.",
      lastCheckedAt: Date.now(),
    };
  }
}
