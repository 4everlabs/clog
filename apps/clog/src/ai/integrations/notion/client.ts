import type { IntegrationHealthView } from "@clog/types";
import type { NotionRuntimeConfig } from "../../../runtime/config";

export interface NotionIntegrationClientConfig {
  readonly config: NotionRuntimeConfig;
  readonly enabled: boolean;
}

export class NotionIntegrationClient {
  constructor(private readonly deps: NotionIntegrationClientConfig) {}

  async getHealth(): Promise<IntegrationHealthView> {
    if (!this.deps.enabled) {
      return {
        kind: "notion",
        status: "disabled",
        summary: "Notion integration is disabled.",
        lastCheckedAt: Date.now(),
      };
    }

    const ready = Boolean(this.deps.config.token);
    return {
      kind: "notion",
      status: ready ? "ready" : "missing-config",
      summary: ready
        ? `Notion todo reader is configured for "${this.deps.config.todoSearchTitle}".`
        : "Notion todo reader is missing NOTION_SECRET.",
      lastCheckedAt: Date.now(),
    };
  }
}
