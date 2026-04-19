import type { IntegrationHealthView } from "@clog/types";
import type { ConvexRuntimeConfig } from "../../runtime/config";

export class ConvexIntegrationClient {
  constructor(private readonly config: ConvexRuntimeConfig) {}

  async getHealth(): Promise<IntegrationHealthView> {
    const ready = Boolean(this.config.deploymentUrl);
    return {
      kind: "convex",
      status: ready ? "ready" : "missing-config",
      summary: ready
        ? "Convex read-only query access is configured."
        : "Convex read-only query access is missing CLOG_CONVEX_URL or CONVEX_URL.",
      lastCheckedAt: Date.now(),
    };
  }
}
