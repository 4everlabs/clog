import type {
  PostHogInsightQueryResult,
  PostHogOrganizationSummary,
  PostHogProjectSummary,
} from "@clog/types";
import type { PostHogRuntimeConfig } from "../../runtime/config";
import {
  normalizePostHogMcpToolArguments,
  resolvePostHogMcpToolName,
} from "./mcp-tooling";

const MCP_PROTOCOL_VERSION = "2025-06-18";

type FetchFn = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

const writeStdoutLine = (value: string): void => {
  process.stdout.write(`${value}\n`);
};

interface JsonRpcErrorPayload {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

interface JsonRpcSuccess<TResult> {
  readonly jsonrpc: "2.0";
  readonly id?: number | string;
  readonly result: TResult;
}

interface JsonRpcFailure {
  readonly jsonrpc: "2.0";
  readonly id?: number | string;
  readonly error: JsonRpcErrorPayload;
}

type JsonRpcResponse<TResult> = JsonRpcSuccess<TResult> | JsonRpcFailure;

interface McpInitializeResult {
  readonly protocolVersion: string;
}

interface McpToolDefinition {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
}

interface McpToolListResult {
  readonly tools?: readonly McpToolDefinition[];
}

interface McpTextContent {
  readonly type: string;
  readonly text?: string;
}

interface McpToolCallResult {
  readonly content?: readonly McpTextContent[];
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
}

interface McpSessionState {
  readonly sessionId: string | null;
  readonly protocolVersion: string;
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const toStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
);

const toUnknownArray = (value: unknown): unknown[] => (
  Array.isArray(value) ? [...value] : []
);

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const stripQuotes = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"") && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
};

const extractField = (block: string, fieldName: string): string | null => {
  const match = block.match(new RegExp(`^ {4}${fieldName}: (.+)$`, "m"));
  return match?.[1] ? stripQuotes(match[1]) : null;
};

const extractTopLevelBlocks = (text: string): string[] => {
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of text.split(/\r?\n/u)) {
    if (line.startsWith("  - id: ")) {
      if (current.length > 0) {
        blocks.push(current.join("\n"));
      }
      current = [line];
      continue;
    }

    if (current.length > 0) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    blocks.push(current.join("\n"));
  }

  return blocks;
};

const resolveMcpEndpoint = (host: string): string => {
  const hostname = new URL(host).hostname.toLowerCase();
  if (hostname === "eu.posthog.com") {
    return "https://mcp-eu.posthog.com/mcp";
  }

  if (hostname === "us.posthog.com" || hostname === "app.posthog.com" || hostname.endsWith(".posthog.com")) {
    return "https://mcp.posthog.com/mcp";
  }

  return new URL("/mcp", host).toString();
};

const createTimeoutSignal = (timeoutMs: number): AbortSignal | undefined => {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }

  return undefined;
};

const parseJsonRpcResponse = <TResult>(
  payload: unknown,
  requestId: number,
): JsonRpcSuccess<TResult> => {
  const response = payload as JsonRpcResponse<TResult>;
  if ("error" in response) {
    throw new Error(`PostHog MCP error ${response.error.code}: ${response.error.message}`);
  }

  if (response.id !== undefined && response.id !== requestId) {
    throw new Error(`PostHog MCP returned mismatched response id ${String(response.id)} for request ${requestId}`);
  }

  return response;
};

const parseSsePayload = (payload: string): unknown[] => {
  const messages: unknown[] = [];
  let dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) {
      return;
    }

    const data = dataLines.join("\n").trim();
    dataLines = [];
    if (!data) {
      return;
    }

    messages.push(JSON.parse(data));
  };

  for (const line of payload.split(/\r?\n/u)) {
    if (!line) {
      flush();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  flush();
  return messages;
};

export class PostHogMcpClient {
  private readonly endpoint: string;
  private readonly requestTimeoutMs: number;
  private session: McpSessionState | null = null;
  private nextRequestId = 1;

  constructor(
    private readonly config: PostHogRuntimeConfig,
    private readonly fetchFn: FetchFn = fetch,
  ) {
    this.endpoint = resolveMcpEndpoint(config.host);
    this.requestTimeoutMs = config.requestTimeoutMs;
  }

  async listTools(): Promise<readonly McpToolDefinition[]> {
    const result = await this.request<McpToolListResult>("tools/list", {});
    return result.tools ?? [];
  }

  async callNamedTool(name: string, args: Record<string, unknown> = {}): Promise<{
    readonly toolName: string;
    readonly text: string;
    readonly structuredContent?: unknown;
  }> {
    const resolvedName = resolvePostHogMcpToolName(name);
    const result = await this.callTool(name, args);
    return {
      toolName: resolvedName,
      text: this.extractText(result),
      structuredContent: result.structuredContent,
    };
  }

  async getOrganizations(): Promise<readonly PostHogOrganizationSummary[]> {
    const result = await this.callTool("organizations-list", {});
    const text = this.extractText(result);
    return extractTopLevelBlocks(text).map((block) => ({
      id: block.match(/^  - id: (.+)$/m)?.[1]?.trim() ?? "",
      name: extractField(block, "name") ?? "Unknown organization",
      slug: extractField(block, "slug") ?? "unknown",
      membershipLevel: toNumber(extractField(block, "membership_level")),
    })).filter((organization) => organization.id.length > 0);
  }

  async getProjects(organizationId?: string): Promise<{
    readonly organizationId: string;
    readonly projects: readonly PostHogProjectSummary[];
  }> {
    const result = await this.callTool("projects-get", {});
    const text = this.extractText(result);
    const projects = extractTopLevelBlocks(text).map((block) => ({
      id: toNumber(block.match(/^  - id: (.+)$/m)?.[1]?.trim()) ?? 0,
      organizationId: extractField(block, "organization"),
      name: extractField(block, "name") ?? "Unknown project",
      projectToken: extractField(block, "api_token"),
    })).filter((project) => project.id > 0);

    const resolvedOrganizationId = organizationId
      ?? projects[0]?.organizationId
      ?? (await this.getOrganizations())[0]?.id
      ?? "";

    if (!resolvedOrganizationId) {
      throw new Error("PostHog MCP did not return an accessible organization.");
    }

    return {
      organizationId: resolvedOrganizationId,
      projects,
    };
  }

  async runQuery(name: string, query: string): Promise<PostHogInsightQueryResult> {
    const result = await this.callTool("query-run", {
      query: {
        kind: "DataVisualizationNode",
        source: {
          kind: "HogQLQuery",
          query,
        },
      },
    });
    const structured = asRecord(result.structuredContent);
    const resultsRecord = asRecord(structured?.results);
    if (!resultsRecord) {
      throw new Error("PostHog MCP query-run did not return structured results.");
    }

    const columns = toStringArray(resultsRecord.columns);
    const rows = toUnknownArray(resultsRecord.results);

    return {
      name,
      columns,
      results: this.normalizeQueryResults(columns, rows),
    };
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    const resolvedName = resolvePostHogMcpToolName(name);
    const normalizedArgs = normalizePostHogMcpToolArguments(resolvedName, args);
    writeStdoutLine(`[posthog-mcp] calling ${resolvedName}`);
    const result = await this.request<McpToolCallResult>("tools/call", {
      name: resolvedName,
      arguments: normalizedArgs,
    });
    if (result.isError) {
      throw new Error(this.extractText(result) || `PostHog MCP tool "${resolvedName}" returned an error.`);
    }

    return result;
  }

  private extractText(result: McpToolCallResult): string {
    return (result.content ?? [])
      .filter((entry) => entry.type === "text" && typeof entry.text === "string")
      .map((entry) => entry.text ?? "")
      .join("\n\n")
      .trim();
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

  private async request<TResult>(method: string, params: Record<string, unknown>): Promise<TResult> {
    return await this.withSessionRetry(async () => {
      await this.ensureInitialized();
      const requestId = this.nextRequestId;
      this.nextRequestId += 1;

      const response = await this.fetchFn(this.endpoint, {
        method: "POST",
        headers: this.createHeaders(true),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: requestId,
          method,
          params,
        }),
        signal: createTimeoutSignal(this.requestTimeoutMs),
      });

      if (response.status === 404 && this.session?.sessionId) {
        this.session = null;
        throw new Error("PostHog MCP session expired");
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`PostHog MCP ${response.status}: ${body.slice(0, 500)}`);
      }

      const message = await this.readResponse<TResult>(response, requestId);
      return message.result;
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (this.session) {
      return;
    }

    const requestId = this.nextRequestId;
    this.nextRequestId += 1;

    const response = await this.fetchFn(this.endpoint, {
      method: "POST",
      headers: this.createHeaders(false),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method: "initialize",
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "clog",
            version: "0.0.0",
          },
        },
      }),
      signal: createTimeoutSignal(this.requestTimeoutMs),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`PostHog MCP initialize failed: ${response.status} ${body.slice(0, 500)}`);
    }

    const message = await this.readResponse<McpInitializeResult>(response, requestId);
    const sessionId = response.headers.get("mcp-session-id");
    this.session = {
      sessionId,
      protocolVersion: message.result.protocolVersion || MCP_PROTOCOL_VERSION,
    };

    writeStdoutLine(`[posthog-mcp] initialized ${JSON.stringify({
      endpoint: this.endpoint,
      protocolVersion: this.session.protocolVersion,
      sessionId: this.session.sessionId,
    })}`);

    const initializedResponse = await this.fetchFn(this.endpoint, {
      method: "POST",
      headers: this.createHeaders(true),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
      signal: createTimeoutSignal(this.requestTimeoutMs),
    });

    if (initializedResponse.status !== 202) {
      const body = await initializedResponse.text();
      throw new Error(`PostHog MCP initialized notification failed: ${initializedResponse.status} ${body.slice(0, 500)}`);
    }
  }

  private async readResponse<TResult>(
    response: Response,
    requestId: number,
  ): Promise<JsonRpcSuccess<TResult>> {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      const payload = await response.text();
      const messages = parseSsePayload(payload);
      const matched = messages.find((message) => {
        const responseMessage = message as Partial<JsonRpcSuccess<TResult> & JsonRpcFailure>;
        return responseMessage.id === requestId || ("error" in responseMessage) || ("result" in responseMessage);
      });

      if (!matched) {
        throw new Error("PostHog MCP stream response did not include a JSON-RPC message.");
      }

      return parseJsonRpcResponse<TResult>(matched, requestId);
    }

    return parseJsonRpcResponse<TResult>(await response.json(), requestId);
  }

  private createHeaders(includeSession: boolean): HeadersInit {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
      "authorization": `Bearer ${this.requirePersonalApiKey()}`,
    };

    if (this.config.projectId?.trim()) {
      headers["x-posthog-project-id"] = this.config.projectId.trim();
    }

    if (includeSession && this.session) {
      headers["mcp-protocol-version"] = this.session.protocolVersion;
      if (this.session.sessionId) {
        headers["mcp-session-id"] = this.session.sessionId;
      }
    }

    return headers;
  }

  private requirePersonalApiKey(): string {
    const apiKey = this.config.personalApiKey?.trim();
    if (!apiKey) {
      throw new Error("POSTHOG_API_KEY is required to call the PostHog MCP server.");
    }

    return apiKey;
  }

  private async withSessionRetry<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("session expired")) {
        throw error;
      }

      return await operation();
    }
  }
}
