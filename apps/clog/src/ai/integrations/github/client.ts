import type { IntegrationHealthView } from "@clog/types";

export interface GitHubIntegrationClientConfig {
  readonly enabled: boolean;
}

export class GitHubIntegrationClient {
  constructor(private readonly config: GitHubIntegrationClientConfig) {}

  async getHealth(): Promise<IntegrationHealthView> {
    if (!this.config.enabled) {
      return {
        kind: "github",
        status: "disabled",
        summary: "GitHub integration is disabled.",
        lastCheckedAt: Date.now(),
      };
    }

    return {
      kind: "github",
      status: "degraded",
      summary: "GitHub integration is enabled but still a stub.",
      lastCheckedAt: Date.now(),
    };
  }
}
