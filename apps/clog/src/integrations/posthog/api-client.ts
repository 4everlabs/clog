import type { PostHogInsightQueryResult, PostHogOrganizationSummary, PostHogProjectSummary } from "@clog/types";
import type { PostHogRuntimeConfig } from "../../config";

interface PostHogListResponse<T> {
  readonly results?: readonly T[];
}

interface PostHogOrganizationApiRecord {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly membership_level?: number | null;
}

interface PostHogProjectApiRecord {
  readonly id: number;
  readonly organization_id?: string | null;
  readonly name: string;
  readonly api_token?: string | null;
}

interface PostHogQueryApiResponse {
  readonly columns?: readonly string[];
  readonly results?: readonly unknown[];
}

export class PostHogApiClient {
  constructor(
    private readonly config: PostHogRuntimeConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async getOrganizations(): Promise<readonly PostHogOrganizationSummary[]> {
    const response = await this.requestJson<PostHogListResponse<PostHogOrganizationApiRecord>>("/api/organizations/");
    return (response.results ?? []).map((organization) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      membershipLevel: organization.membership_level ?? null,
    }));
  }

  async getProjects(organizationId?: string): Promise<{
    readonly organizationId: string;
    readonly projects: readonly PostHogProjectSummary[];
  }> {
    const resolvedOrganizationId = organizationId ?? await this.resolveDefaultOrganizationId();
    const response = await this.requestJson<PostHogListResponse<PostHogProjectApiRecord>>(
      `/api/organizations/${encodeURIComponent(resolvedOrganizationId)}/projects/`,
    );

    return {
      organizationId: resolvedOrganizationId,
      projects: (response.results ?? []).map((project) => ({
        id: project.id,
        organizationId: project.organization_id ?? null,
        name: project.name,
        projectToken: project.api_token ?? null,
      })),
    };
  }

  async runQuery(name: string, query: string, refresh?: string): Promise<PostHogInsightQueryResult> {
    const projectId = this.requireProjectId();
    const response = await this.requestJson<PostHogQueryApiResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/query/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: {
            kind: "HogQLQuery",
            query,
          },
          name,
          refresh,
        }),
      },
    );

    const columns = [...(response.columns ?? [])];
    return {
      name,
      columns,
      results: this.normalizeQueryResults(columns, response.results ?? []),
    };
  }

  async runInsightQuery(name: string, query: string): Promise<PostHogInsightQueryResult> {
    return await this.runQuery(name, query);
  }

  private normalizeQueryResults(
    columns: readonly string[],
    results: readonly unknown[],
  ): Record<string, unknown>[] {
    return results.map((row) => {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        return row as Record<string, unknown>;
      }

      if (Array.isArray(row)) {
        return Object.fromEntries(
          columns.map((column, index) => [column, row[index] ?? null]),
        );
      }

      return { value: row };
    });
  }

  private async resolveDefaultOrganizationId(): Promise<string> {
    const organizations = await this.getOrganizations();
    const organizationId = organizations[0]?.id;
    if (!organizationId) {
      throw new Error("No PostHog organizations are available for the configured API key.");
    }

    return organizationId;
  }

  private requireProjectId(): string {
    const projectId = this.config.projectId?.trim();
    if (!projectId) {
      throw new Error("POSTHOG_PROJECT_ID is required to run PostHog queries.");
    }

    return projectId;
  }

  private requirePersonalApiKey(): string {
    const apiKey = this.config.personalApiKey?.trim();
    if (!apiKey) {
      throw new Error("POSTHOG_API_KEY is required to call the PostHog API.");
    }

    return apiKey;
  }

  private async requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchFn(`${this.config.host}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.requirePersonalApiKey()}`,
        ...init.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`PostHog API ${response.status}: ${body.slice(0, 500)}`);
    }

    return await response.json() as T;
  }
}
