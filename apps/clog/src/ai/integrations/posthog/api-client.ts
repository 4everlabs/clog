import type { PostHogInsightQueryResult, PostHogOrganizationSummary, PostHogProjectSummary } from "@clog/types";
import type { PostHogRuntimeConfig } from "../../../runtime/config";
import { PostHogMcpClient } from "./mcp-client";

type FetchFn = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

const writeStderrLine = (value: string): void => {
  process.stderr.write(`${value}\n`);
};

export class PostHogApiClient {
  private readonly mcpClient: PostHogMcpClient;

  constructor(
    private readonly config: PostHogRuntimeConfig,
    private readonly fetchFn: FetchFn = fetch,
  ) {
    this.mcpClient = new PostHogMcpClient(config, fetchFn as typeof fetch);
  }

  async getOrganizations(): Promise<readonly PostHogOrganizationSummary[]> {
    return await this.mcpClient.getOrganizations();
  }

  async getProjects(organizationId?: string): Promise<{
    readonly organizationId: string;
    readonly projects: readonly PostHogProjectSummary[];
  }> {
    return await this.mcpClient.getProjects(organizationId);
  }

  async listMcpTools(input: {
    readonly nameFilter?: string;
    readonly includeInputSchema?: boolean;
    readonly limit?: number;
  } = {}): Promise<{
    readonly total: number;
    readonly returned: number;
    readonly tools: ReadonlyArray<{
      readonly name: string;
      readonly title?: string | null;
      readonly description?: string | null;
      readonly inputSchema?: unknown;
    }>;
  }> {
    const normalizedFilter = input.nameFilter?.trim().toLowerCase() ?? "";
    const includeInputSchema = input.includeInputSchema === true;
    const limit = input.limit ?? 50;
    const allTools = await this.mcpClient.listTools();
    const filteredTools = normalizedFilter
      ? allTools.filter((tool) => (
        tool.name.toLowerCase().includes(normalizedFilter)
        || tool.title?.toLowerCase().includes(normalizedFilter)
        || tool.description?.toLowerCase().includes(normalizedFilter)
      ))
      : allTools;

    const tools = filteredTools.slice(0, limit).map((tool) => ({
      name: tool.name,
      title: tool.title ?? null,
      description: tool.description ?? null,
      inputSchema: includeInputSchema ? tool.inputSchema : undefined,
    }));

    return {
      total: filteredTools.length,
      returned: tools.length,
      tools,
    };
  }

  async runQuery(name: string, query: string, refresh?: string): Promise<PostHogInsightQueryResult> {
    if (refresh) {
      writeStderrLine(`[posthog-mcp] ignoring unsupported refresh mode "${refresh}" for query-run`);
    }

    return await this.mcpClient.runQuery(name, query);
  }

  async runInsightQuery(name: string, query: string): Promise<PostHogInsightQueryResult> {
    return await this.runQuery(name, query);
  }

  async callMcpTool(toolName: string, args: Record<string, unknown> = {}): Promise<{
    readonly toolName: string;
    readonly text: string;
    readonly structuredContent?: unknown;
  }> {
    return await this.mcpClient.callNamedTool(toolName, args);
  }
}
