import type { IntegrationHealthView, RuntimeObservation } from "@clog/types";
import type { PostHogRuntimeConfig } from "../../config";
import type { PostHogApiClient } from "./api-client";

export interface PostHogIntegrationClientConfig {
  readonly api: Pick<PostHogApiClient, "callMcpTool" | "runQuery">;
  readonly config: PostHogRuntimeConfig;
  readonly capabilities: {
    readonly canReadErrors: boolean;
  };
}

interface ErrorTrackingIssueRow {
  readonly id?: string | null;
  readonly status?: string | null;
  readonly name?: string | null;
  readonly description?: string | null;
  readonly first_seen?: string | null;
  readonly _posthogUrl?: string | null;
}

const toTimestamp = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Date.now();
};

export class PostHogIntegrationClient {
  constructor(private readonly deps: PostHogIntegrationClientConfig) {}

  async listErrorObservations(): Promise<readonly RuntimeObservation[]> {
    if (!this.deps.capabilities.canReadErrors) {
      return [];
    }

    const result = await this.deps.api.callMcpTool("error-tracking-issues-list", {
      limit: 10,
      offset: 0,
    });
    const structured = result.structuredContent;
    const results = Array.isArray((structured as { results?: unknown[] } | undefined)?.results)
      ? (structured as { results: unknown[] }).results
      : [];

    return results.flatMap((row) => {
      const issue = row as ErrorTrackingIssueRow;
      const issueId = issue.id?.trim();
      if (!issueId) {
        return [];
      }

      const name = issue.name?.trim() || "Error";
      const description = issue.description?.trim() || "No error description provided";
      const status = issue.status?.trim() || "unknown";
      const detectedAt = toTimestamp(issue.first_seen);
      const severity = status === "active" ? "warning" : "info";

      return [{
        id: `posthog-error-${issueId}`,
        kind: "error-rate-spike",
        source: {
          kind: "posthog",
          label: "PostHog error tracking",
          referenceId: issueId,
          url: issue._posthogUrl ?? undefined,
        },
        summary: `${name} is ${status} in PostHog error tracking`,
        details: description,
        severity,
        detectedAt,
        metadata: {
          issueId,
          status,
          name,
          posthogUrl: issue._posthogUrl ?? null,
        },
      } satisfies RuntimeObservation];
    });
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
