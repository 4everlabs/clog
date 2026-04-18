import { describe, expect, test } from "bun:test";
import { ConvexApiClient } from "../apps/clog/src/integrations/convex/api-client";

describe("ConvexApiClient", () => {
  test("runs a query through the Convex HTTP API and normalizes the response", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = [];
    const client = new ConvexApiClient({
      deploymentUrl: "https://happy-otter-123.convex.cloud",
      authToken: "jwt-token",
      requestTimeoutMs: 5_000,
    }, async (input, init) => {
      requests.push({ input: String(input), init });
      return new Response(JSON.stringify({
        status: "success",
        value: {
          tasks: 3,
          latestRunAt: "2026-04-18T20:00:00.000Z",
        },
        logLines: ["query ok"],
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    const result = await client.runQuery({
      path: "ops:getSummary",
      args: {
        includeArchived: false,
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe("https://happy-otter-123.convex.cloud/api/query");
    expect(requests[0]?.init?.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer jwt-token",
    });
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      path: "ops:getSummary",
      args: {
        includeArchived: false,
      },
      format: "json",
    });
    expect(result).toEqual({
      path: "ops:getSummary",
      summary: {
        valueType: "object",
        childKeys: ["tasks", "latestRunAt"],
        itemCount: null,
        hasLogs: true,
      },
      value: {
        tasks: 3,
        latestRunAt: "2026-04-18T20:00:00.000Z",
      },
      logLines: ["query ok"],
      printout: "Convex query: ops:getSummary\nValue type: object\nKeys: tasks, latestRunAt\nLogs: present",
    });
  });
});
