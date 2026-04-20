import type { IntegrationHealthView } from "@clog/types";
import type { ConvexRuntimeConfig } from "../../../runtime/config";

export interface ConvexIntegrationClientConfig {
  readonly config: ConvexRuntimeConfig;
  readonly enabled: boolean;
}

export class ConvexIntegrationClient {
  constructor(private readonly deps: ConvexIntegrationClientConfig) {}

  async getHealth(): Promise<IntegrationHealthView> {
    if (!this.deps.enabled) {
      return {
        kind: "convex",
        status: "disabled",
        summary: "Convex integration is disabled.",
        lastCheckedAt: Date.now(),
      };
    }

    const ready = Boolean(this.deps.config.deploymentUrl);
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
