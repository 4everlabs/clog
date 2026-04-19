import { describe, expect, test } from "bun:test";
import { PostHogApiClient } from "../apps/clog/src/ai/integrations/posthog/api-client";

const toEventStreamBody = (payload: unknown): string => (
  `event: message\ndata: ${JSON.stringify(payload)}\n\n`
);

const createEventStreamResponse = (
  payload: unknown,
  extraHeaders: Record<string, string> = {},
): Response => (
  new Response(toEventStreamBody(payload), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      ...extraHeaders,
    },
  })
);

const createClient = (
  responses: readonly Response[],
) => {
  const requests: Array<{
    readonly url: string;
    readonly init?: RequestInit;
  }> = [];
  let callIndex = 0;

  const fetchFn = async (input: URL | RequestInfo, init?: RequestInit) => {
    requests.push({
      url: typeof input === "string" ? input : input.toString(),
      init,
    });
    const response = responses[callIndex];
    callIndex += 1;
    if (!response) {
      throw new Error("Missing mocked response");
    }

    return response;
  };

  return {
    client: new PostHogApiClient({
      host: "https://us.posthog.com",
      workspaceDir: "/tmp/workspace",
      projectId: "238024",
      personalApiKey: "phx_test",
      projectApiKey: "phc_test",
      featureFlagsSecureApiKey: null,
      endpointsDir: "/tmp/endpoints",
      cliBin: "posthog-cli",
      cliTimeoutMs: 30_000,
      requestTimeoutMs: 10_000,
      enableLogs: false,
      enableFlags: false,
      enableExperiments: false,
      errorLookbackMinutes: 30,
      errorSpikeThreshold: 10,
      errorSpikeMultiplier: 2,
      criticalErrorThreshold: 25,
      insightMonitors: [],
    }, fetchFn),
    requests,
  };
};

describe("PostHogApiClient", () => {
  test("lists organizations and projects through the MCP transport", async () => {
    const { client, requests } = createClient([
      createEventStreamResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: {
            tools: {
              listChanged: true,
            },
          },
          serverInfo: {
            name: "PostHog",
            version: "1.0.0",
          },
        },
      }, {
        "mcp-session-id": "session-1",
      }),
      new Response(null, { status: 202 }),
      createEventStreamResponse({
        jsonrpc: "2.0",
        id: 2,
        result: {
          content: [
            {
              type: "text",
              text: [
                "[1]:",
                "  - id: org_1",
                "    name: Acme",
                "    slug: acme",
                "    membership_level: 15",
              ].join("\n"),
            },
          ],
        },
      }),
      createEventStreamResponse({
        jsonrpc: "2.0",
        id: 3,
        result: {
          content: [
            {
              type: "text",
              text: [
                "[1]:",
                "  - id: 238024",
                "    organization: org_1",
                "    api_token: phc_project",
                "    name: Acme Product",
              ].join("\n"),
            },
          ],
        },
      }),
    ]);

    await expect(client.getOrganizations()).resolves.toEqual([
      {
        id: "org_1",
        name: "Acme",
        slug: "acme",
        membershipLevel: 15,
      },
    ]);

    await expect(client.getProjects("org_1")).resolves.toEqual({
      organizationId: "org_1",
      projects: [
        {
          id: 238024,
          organizationId: "org_1",
          name: "Acme Product",
          projectToken: "phc_project",
        },
      ],
    });

    expect(requests.map((request) => request.url)).toEqual([
      "https://mcp.posthog.com/mcp",
      "https://mcp.posthog.com/mcp",
      "https://mcp.posthog.com/mcp",
      "https://mcp.posthog.com/mcp",
    ]);
    expect(JSON.parse(String(requests[0]?.init?.body ?? "{}")).method).toBe("initialize");
    expect(JSON.parse(String(requests[1]?.init?.body ?? "{}")).method).toBe("notifications/initialized");
    expect(JSON.parse(String(requests[2]?.init?.body ?? "{}")).params.name).toBe("organizations-list");
    expect(JSON.parse(String(requests[3]?.init?.body ?? "{}")).params.name).toBe("projects-get");
    expect(new Headers(requests[3]?.init?.headers).get("mcp-session-id")).toBe("session-1");
  });

  test("runs HogQL queries through the MCP transport and maps row arrays to keyed objects", async () => {
    const { client, requests } = createClient([
      createEventStreamResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: {
            tools: {
              listChanged: true,
            },
          },
          serverInfo: {
            name: "PostHog",
            version: "1.0.0",
          },
        },
      }, {
        "mcp-session-id": "session-2",
      }),
      new Response(null, { status: 202 }),
      createEventStreamResponse({
        jsonrpc: "2.0",
        id: 2,
        result: {
          content: [
            {
              type: "text",
              text: "query result",
            },
          ],
          structuredContent: {
            results: {
              columns: ["event", "count"],
              results: [
                ["$pageview", 12],
                ["signup", 3],
              ],
            },
          },
        },
      }),
    ]);

    await expect(client.runQuery("recent_events", "select event, count() from events limit 2")).resolves.toEqual({
      name: "recent_events",
      columns: ["event", "count"],
      results: [
        { event: "$pageview", count: 12 },
        { event: "signup", count: 3 },
      ],
    });

    expect(requests[2]?.url).toBe("https://mcp.posthog.com/mcp");
    expect(requests[2]?.init?.method).toBe("POST");
    const body = JSON.parse(String(requests[2]?.init?.body ?? "{}"));
    expect(body.method).toBe("tools/call");
    expect(body.params.name).toBe("query-run");
    expect(body.params.arguments.query).toEqual({
      kind: "DataVisualizationNode",
      source: {
        kind: "HogQLQuery",
        query: "select event, count() from events limit 2",
      },
    });
  });

  test("resolves legacy tool aliases and reshapes query-logs requests once at the MCP boundary", async () => {
    const { client, requests } = createClient([
      createEventStreamResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: {
            tools: {
              listChanged: true,
            },
          },
          serverInfo: {
            name: "PostHog",
            version: "1.0.0",
          },
        },
      }, {
        "mcp-session-id": "session-3",
      }),
      new Response(null, { status: 202 }),
      createEventStreamResponse({
        jsonrpc: "2.0",
        id: 2,
        result: {
          content: [{ type: "text", text: "listed insights" }],
        },
      }),
      createEventStreamResponse({
        jsonrpc: "2.0",
        id: 3,
        result: {
          content: [{ type: "text", text: "queried logs" }],
        },
      }),
    ]);

    await expect(client.callMcpTool("insights-get-all", { limit: 5 })).resolves.toMatchObject({
      toolName: "insights-list",
      text: "listed insights",
    });
    await expect(client.callMcpTool("logs-query", {
      query: "timeout",
      service: "web",
      level: "ERROR",
      from: "-1h",
      to: "now",
      limit: 50,
    })).resolves.toMatchObject({
      toolName: "query-logs",
      text: "queried logs",
    });

    const insightCall = JSON.parse(String(requests[2]?.init?.body ?? "{}"));
    expect(insightCall.params.name).toBe("insights-list");
    expect(insightCall.params.arguments).toEqual({ limit: 5 });

    const logsCall = JSON.parse(String(requests[3]?.init?.body ?? "{}"));
    expect(logsCall.params.name).toBe("query-logs");
    expect(logsCall.params.arguments).toEqual({
      query: {
        searchTerm: "timeout",
        serviceNames: ["web"],
        severityLevels: ["error"],
        dateRange: {
          date_from: "-1h",
          date_to: "now",
        },
        limit: 50,
      },
    });
  });
});
