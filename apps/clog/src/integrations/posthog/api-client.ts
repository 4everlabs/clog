import { PostHog } from "posthog-node";
import type { PostHogInsightQueryResult } from "@clog/types";
import type { PostHogRuntimeConfig } from "../../config";
import type {
  PostHogFeatureFlag,
  PostHogHealthcheckResult,
  PostHogQueryResponse,
  PostHogQueryRow,
} from "./types";

interface PostHogPaginatedResponse<T> {
  readonly results?: readonly T[];
}

const CONTROLLED_TIMEOUT_ERROR = "PostHog API request timed out";

const assertRecord = (value: unknown): PostHogQueryRow => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected PostHog response row to be an object");
  }

  return value as PostHogQueryRow;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
};

const normalizeQueryResponse = <T extends PostHogQueryRow>(payload: unknown): PostHogQueryResponse<T> => {
  const record = assertRecord(payload);
  const nested = record.results ? record : (record.result ? assertRecord(record.result) : record);
  const rawResults = Array.isArray(nested.results) ? nested.results : [];

  return {
    columns: asStringArray(nested.columns),
    results: rawResults.map((row) => assertRecord(row) as T),
  };
};

export class PostHogApiClient {
  private readonly host: string;
  private readonly captureClient: PostHog | null;

  constructor(private readonly config: PostHogRuntimeConfig) {
    this.host = config.host.replace(/\/+$/u, "");
    this.captureClient = config.projectApiKey
      ? new PostHog(config.projectApiKey, { host: this.host })
      : null;
  }

  getMissingConfiguration(): string[] {
    const missing: string[] = [];

    if (!this.config.projectId) {
      missing.push("POSTHOG_CLAW_POSTHOG_PROJECT_ID");
    }
    if (!this.config.personalApiKey) {
      missing.push("POSTHOG_CLAW_POSTHOG_PERSONAL_API_KEY");
    }

    return missing;
  }

  isReadyForManagementQueries(): boolean {
    return this.getMissingConfiguration().length === 0;
  }

  async describeAccess(): Promise<PostHogHealthcheckResult> {
    const checkedAt = Date.now();
    const missing = this.getMissingConfiguration();
    if (missing.length > 0) {
      return {
        ok: false,
        summary: `Missing PostHog credentials: ${missing.join(", ")}`,
        checkedAt,
      };
    }

    try {
      await this.queryHogQL("clog-healthcheck", "SELECT 1 AS ok");
      return {
        ok: true,
        summary: `Connected to PostHog project ${this.config.projectId}.`,
        checkedAt,
      };
    } catch (error) {
      return {
        ok: false,
        summary: error instanceof Error ? error.message : "Unknown PostHog healthcheck failure",
        checkedAt,
      };
    }
  }

  async queryHogQL<T extends PostHogQueryRow>(name: string, query: string): Promise<PostHogQueryResponse<T>> {
    const projectId = this.config.projectId;
    if (!projectId || !this.config.personalApiKey) {
      throw new Error(`PostHog query "${name}" cannot run without project ID and personal API key`);
    }

    const response = await this.requestJson<unknown>(`/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        name,
        query: {
          kind: "HogQLQuery",
          query,
        },
      }),
    });

    return normalizeQueryResponse<T>(response);
  }

  async runInsightQuery(name: string, query: string): Promise<PostHogInsightQueryResult> {
    const response = await this.queryHogQL(name, query);
    return {
      name,
      columns: response.columns,
      results: response.results,
    };
  }

  async listFeatureFlags(limit = 100): Promise<PostHogFeatureFlag[]> {
    const projectId = this.config.projectId;
    if (!projectId || !this.config.personalApiKey) {
      throw new Error("PostHog feature flags cannot be listed without project ID and personal API key");
    }

    const response = await this.requestJson<PostHogPaginatedResponse<PostHogFeatureFlag>>(
      `/api/projects/${projectId}/feature_flags/?limit=${limit}`,
    );
    return [...(response.results ?? [])];
  }

  async captureServiceEvent(event: string, properties: Record<string, unknown> = {}): Promise<void> {
    if (!this.captureClient) {
      return;
    }

    this.captureClient.capture({
      distinctId: "clog-runtime",
      event,
      properties,
    });
    await this.captureClient.flush();
  }

  async shutdown(): Promise<void> {
    if (!this.captureClient) {
      return;
    }

    await this.captureClient.shutdown();
  }

  private async requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(CONTROLLED_TIMEOUT_ERROR), this.config.requestTimeoutMs);

    try {
      const response = await fetch(`${this.host}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.personalApiKey}`,
          Accept: "application/json",
          ...init.headers,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`PostHog API ${response.status}: ${body.slice(0, 500)}`);
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(CONTROLLED_TIMEOUT_ERROR);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
