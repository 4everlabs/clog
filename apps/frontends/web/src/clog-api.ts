import type {
  SurfaceNotionTodoResponse,
  PostHogEndpointDiffRequest,
  PostHogEndpointRunRequest,
  PostHogInsightQueryRequest,
  SurfaceBootstrapResponse,
  SurfaceFindingsResponse,
  SurfacePostHogDocumentedToolCatalogResponse,
  SurfacePostHogEndpointDiffResponse,
  SurfacePostHogEndpointListResponse,
  SurfacePostHogEndpointRunResponse,
  SurfacePostHogErrorsResponse,
  SurfacePostHogInsightResponse,
  SurfacePostHogMcpToolCallResponse,
  SurfacePostHogMcpToolsResponse,
  SurfacePostHogOrganizationsResponse,
  SurfacePostHogProjectsResponse,
  SurfaceSendMessageRequest,
  SurfaceSendMessageResponse,
  SurfaceThreadsResponse,
} from "@clog/types";

export interface ClogApiClientOptions {
  readonly baseUrl: string;
}

const normalizeBaseUrl = (value: string): string => value.trim().replace(/\/+$/u, "");

export const resolveBackendBaseUrl = (env: NodeJS.ProcessEnv = process.env): string => {
  const explicit = env.CLOG_BACKEND_URL?.trim();
  if (explicit) {
    return normalizeBaseUrl(explicit);
  }

  const port = env.PORT?.trim() || "6900";
  return `http://127.0.0.1:${port}`;
};

export class ClogApiClient {
  private readonly baseUrl: string;

  constructor(options: ClogApiClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
  }

  async bootstrap(): Promise<SurfaceBootstrapResponse> {
    return await this.request<SurfaceBootstrapResponse>("/api/bootstrap");
  }

  async listFindings(): Promise<SurfaceFindingsResponse> {
    return await this.request<SurfaceFindingsResponse>("/api/findings");
  }

  async listThreads(): Promise<SurfaceThreadsResponse> {
    return await this.request<SurfaceThreadsResponse>("/api/threads");
  }

  async sendMessage(input: SurfaceSendMessageRequest): Promise<SurfaceSendMessageResponse> {
    return await this.request<SurfaceSendMessageResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listPostHogOrganizations(): Promise<SurfacePostHogOrganizationsResponse> {
    return await this.request<SurfacePostHogOrganizationsResponse>("/api/posthog/organizations");
  }

  async listPostHogProjects(organizationId?: string): Promise<SurfacePostHogProjectsResponse> {
    const search = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
    return await this.request<SurfacePostHogProjectsResponse>(`/api/posthog/projects${search}`);
  }

  async getPostHogDocumentedToolCatalog(input: {
    readonly feature?: string;
    readonly priority?: "core" | "high" | "extended";
    readonly includeExtended?: boolean;
  } = {}): Promise<SurfacePostHogDocumentedToolCatalogResponse> {
    const searchParams = new URLSearchParams();
    if (input.feature?.trim()) {
      searchParams.set("feature", input.feature.trim());
    }
    if (input.priority) {
      searchParams.set("priority", input.priority);
    }
    if (input.includeExtended === false) {
      searchParams.set("includeExtended", "false");
    }
    const search = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
    return await this.request<SurfacePostHogDocumentedToolCatalogResponse>(`/api/posthog/catalog${search}`);
  }

  async listPostHogErrors(): Promise<SurfacePostHogErrorsResponse> {
    return await this.request<SurfacePostHogErrorsResponse>("/api/posthog/errors");
  }

  async listPostHogMcpTools(nameFilter?: string, includeInputSchema = false): Promise<SurfacePostHogMcpToolsResponse> {
    const searchParams = new URLSearchParams();
    if (nameFilter?.trim()) {
      searchParams.set("nameFilter", nameFilter.trim());
    }
    if (includeInputSchema) {
      searchParams.set("includeInputSchema", "true");
    }
    const search = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
    return await this.request<SurfacePostHogMcpToolsResponse>(`/api/posthog/mcp/tools${search}`);
  }

  async callPostHogMcpTool(
    toolName: string,
    args?: Record<string, unknown>,
  ): Promise<SurfacePostHogMcpToolCallResponse> {
    return await this.request<SurfacePostHogMcpToolCallResponse>("/api/posthog/mcp/call", {
      method: "POST",
      body: JSON.stringify({
        toolName,
        arguments: args,
      }),
    });
  }

  async queryPostHog(input: PostHogInsightQueryRequest): Promise<SurfacePostHogInsightResponse> {
    return await this.request<SurfacePostHogInsightResponse>("/api/posthog/query", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listPostHogEndpoints(cwd?: string): Promise<SurfacePostHogEndpointListResponse> {
    const search = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
    return await this.request<SurfacePostHogEndpointListResponse>(`/api/posthog/endpoints${search}`);
  }

  async diffPostHogEndpoints(input: PostHogEndpointDiffRequest): Promise<SurfacePostHogEndpointDiffResponse> {
    return await this.request<SurfacePostHogEndpointDiffResponse>("/api/posthog/endpoints/diff", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async runPostHogEndpoint(input: PostHogEndpointRunRequest): Promise<SurfacePostHogEndpointRunResponse> {
    return await this.request<SurfacePostHogEndpointRunResponse>("/api/posthog/endpoints/run", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async getNotionTodoList(input: {
    readonly includeDone?: boolean;
    readonly limit?: number;
    readonly progress?: readonly string[];
  } = {}): Promise<SurfaceNotionTodoResponse> {
    const searchParams = new URLSearchParams();
    if (input.includeDone) {
      searchParams.set("includeDone", "true");
    }
    if (typeof input.limit === "number") {
      searchParams.set("limit", String(input.limit));
    }
    for (const progress of input.progress ?? []) {
      searchParams.append("progress", progress);
    }
    const search = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
    return await this.request<SurfaceNotionTodoResponse>(`/api/notion/todo${search}`);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Clog API ${response.status}: ${body.slice(0, 500)}`);
    }

    return await response.json() as T;
  }
}
