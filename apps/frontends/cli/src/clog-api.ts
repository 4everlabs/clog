import type {
  AgentFinding,
  AgentRuntimeSummary,
  IntegrationHealthView,
  RuntimeObservation,
  SurfaceBootstrapResponse,
  SurfaceFindingsResponse,
  SurfaceSendMessageRequest,
  SurfaceSendMessageResponse,
  SurfaceThreadsResponse,
} from "@clog/types";

export interface MonitorCycleResponse {
  readonly observations: readonly RuntimeObservation[];
  readonly findings: readonly AgentFinding[];
  readonly integrationHealth: readonly IntegrationHealthView[];
}

interface HealthzResponse {
  readonly ok: boolean;
  readonly runtime: AgentRuntimeSummary;
}

export interface ClogApiClientOptions {
  readonly baseUrl: string;
}

const normalizeBaseUrl = (value: string): string => value.trim().replace(/\/+$/u, "");

export const resolveBackendBaseUrl = (env: NodeJS.ProcessEnv = process.env): string => {
  const explicit = env.CLOG_BACKEND_URL?.trim();
  if (explicit) {
    return normalizeBaseUrl(explicit);
  }

  const port = env.PORT?.trim() || "3000";
  return `http://127.0.0.1:${port}`;
};

export class ClogApiClient {
  private readonly baseUrl: string;

  constructor(options: ClogApiClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
  }

  async getRuntimeHealth(): Promise<AgentRuntimeSummary> {
    const response = await this.request<HealthzResponse>("/healthz");
    return response.runtime;
  }

  async bootstrap(): Promise<SurfaceBootstrapResponse> {
    return await this.request<SurfaceBootstrapResponse>("/api/bootstrap");
  }

  async runMonitorCycle(): Promise<MonitorCycleResponse> {
    return await this.request<MonitorCycleResponse>("/api/monitor/tick", {
      method: "POST",
    });
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
