import type { IntegrationHealthView } from "@clog/types";

export class GitHubIntegrationClient {
  async getHealth(): Promise<IntegrationHealthView> {
    return {
      kind: "github",
      status: "missing-config",
      summary: "GitHub integration is still a stub.",
      lastCheckedAt: Date.now(),
    };
  }
}
