import type { IntegrationHealthView } from "@clog/types";

export class VercelIntegrationClient {
  async getHealth(): Promise<IntegrationHealthView> {
    return {
      kind: "vercel",
      status: "missing-config",
      summary: "Vercel integration is still a stub.",
      lastCheckedAt: Date.now(),
    };
  }
}
