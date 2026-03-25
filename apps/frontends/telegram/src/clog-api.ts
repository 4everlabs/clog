import type {
  ConversationThread,
  SurfaceChannelKind,
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

  const port = env.PORT?.trim() || "3000";
  return `http://127.0.0.1:${port}`;
};

export class ClogApiClient {
  private readonly baseUrl: string;

  constructor(options: ClogApiClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
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

  async findThreadByTitle(channel: SurfaceChannelKind, title: string): Promise<ConversationThread | null> {
    const response = await this.listThreads();
    return response.threads.find((thread) => thread.channel === channel && thread.title === title) ?? null;
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
