import type { ConvexQuerySummary, ConvexQueryRequest, SurfaceConvexQueryResponse } from "@clog/types";
import type { ConvexRuntimeConfig } from "../../runtime/config";

type FetchFn = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

interface ConvexSuccessResponse {
  readonly status: "success";
  readonly value: unknown;
  readonly logLines?: readonly string[];
}

interface ConvexErrorResponse {
  readonly status: "error";
  readonly errorMessage?: string;
  readonly errorData?: unknown;
  readonly logLines?: readonly string[];
}

const summarizeValue = (value: unknown, logLines: readonly string[]): ConvexQuerySummary => {
  if (Array.isArray(value)) {
    return {
      valueType: "array",
      childKeys: [],
      itemCount: value.length,
      hasLogs: logLines.length > 0,
    };
  }

  if (value === null) {
    return {
      valueType: "null",
      childKeys: [],
      itemCount: null,
      hasLogs: logLines.length > 0,
    };
  }

  switch (typeof value) {
    case "object":
      return {
        valueType: "object",
        childKeys: Object.keys(value).slice(0, 20),
        itemCount: null,
        hasLogs: logLines.length > 0,
      };
    case "string":
      return {
        valueType: "string",
        childKeys: [],
        itemCount: null,
        hasLogs: logLines.length > 0,
      };
    case "number":
      return {
        valueType: "number",
        childKeys: [],
        itemCount: null,
        hasLogs: logLines.length > 0,
      };
    case "boolean":
      return {
        valueType: "boolean",
        childKeys: [],
        itemCount: null,
        hasLogs: logLines.length > 0,
      };
    default:
      return {
        valueType: "null",
        childKeys: [],
        itemCount: null,
        hasLogs: logLines.length > 0,
      };
  }
};

const buildPrintout = (path: string, summary: ConvexQuerySummary): string => {
  const lines = [
    `Convex query: ${path}`,
    `Value type: ${summary.valueType}`,
  ];

  if (summary.itemCount !== null) {
    lines.push(`Items: ${summary.itemCount}`);
  }

  if (summary.childKeys.length > 0) {
    lines.push(`Keys: ${summary.childKeys.join(", ")}`);
  }

  if (summary.hasLogs) {
    lines.push("Logs: present");
  }

  return lines.join("\n");
};

export class ConvexApiClient {
  constructor(
    private readonly config: ConvexRuntimeConfig,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async runQuery(input: ConvexQueryRequest): Promise<SurfaceConvexQueryResponse> {
    const deploymentUrl = this.config.deploymentUrl?.trim();
    if (!deploymentUrl) {
      throw new Error("CLOG_CONVEX_URL or CONVEX_URL is required to query Convex.");
    }

    const path = input.path.trim();
    if (!path) {
      throw new Error("Convex query path cannot be empty.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      const response = await this.fetchFn(`${deploymentUrl}/api/query`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(this.config.authToken
            ? {
              Authorization: `Bearer ${this.config.authToken}`,
            }
            : {}),
        },
        body: JSON.stringify({
          path,
          args: input.args ?? {},
          format: "json",
        }),
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`Convex API ${response.status}: ${body.slice(0, 500)}`);
      }

      const parsed = JSON.parse(body) as ConvexSuccessResponse | ConvexErrorResponse;
      const logLines = Array.isArray(parsed.logLines)
        ? parsed.logLines.filter((line): line is string => typeof line === "string")
        : [];
      if (parsed.status !== "success") {
        const errorMessage = parsed.errorMessage?.trim() || `Convex query failed for "${path}".`;
        throw new Error(errorMessage);
      }

      const summary = summarizeValue(parsed.value, logLines);
      return {
        path,
        summary,
        value: parsed.value,
        logLines,
        printout: buildPrintout(path, summary),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Convex API request timed out after ${this.config.requestTimeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
