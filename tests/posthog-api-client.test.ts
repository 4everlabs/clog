import { describe, expect, test } from "bun:test";
import { PostHogApiClient } from "../apps/clog/src/integrations/posthog/api-client";

const createClient = (
  responses: Array<{
    readonly ok: boolean;
    readonly body: unknown;
  }>,
) => {
  const requests: Array<{
    readonly url: string;
    readonly init?: RequestInit;
  }> = [];
  let callIndex = 0;

  const fetchFn: typeof fetch = async (input, init) => {
    requests.push({
      url: typeof input === "string" ? input : input.toString(),
      init,
    });
    const response = responses[callIndex];
    callIndex += 1;
    if (!response) {
      throw new Error("Missing mocked response");
    }

    return new Response(JSON.stringify(response.body), {
      status: response.ok ? 200 : 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  return {
    client: new PostHogApiClient({
      host: "https://us.posthog.com",
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
  test("lists organizations and projects with simplified typed results", async () => {
    const { client, requests } = createClient([
      {
        ok: true,
        body: {
          results: [
            {
              id: "org_1",
              name: "Acme",
              slug: "acme",
              membership_level: 15,
            },
          ],
        },
      },
      {
        ok: true,
        body: {
          results: [
            {
              id: 238024,
              organization_id: "org_1",
              name: "Acme Product",
              api_token: "phc_project",
            },
          ],
        },
      },
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
      "https://us.posthog.com/api/organizations/",
      "https://us.posthog.com/api/organizations/org_1/projects/",
    ]);
  });

  test("runs HogQL queries and maps row arrays to keyed objects", async () => {
    const { client, requests } = createClient([
      {
        ok: true,
        body: {
          columns: ["event", "count"],
          results: [
            ["$pageview", 12],
            ["signup", 3],
          ],
        },
      },
    ]);

    await expect(client.runQuery("recent_events", "select event, count() from events limit 2")).resolves.toEqual({
      name: "recent_events",
      columns: ["event", "count"],
      results: [
        { event: "$pageview", count: 12 },
        { event: "signup", count: 3 },
      ],
    });

    expect(requests[0]?.url).toBe("https://us.posthog.com/api/projects/238024/query/");
    expect(requests[0]?.init?.method).toBe("POST");
  });
});
