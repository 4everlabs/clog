import { describe, expect, test } from "bun:test";
import type {
  PostHogCliCommandResponse,
  PostHogEndpointRunRequest,
  RuntimeObservation,
} from "@clog/types";
import { createPostHogToolServices } from "../apps/clog/src/integrations/posthog/tool-services";

const createCliResponse = (command: string): PostHogCliCommandResponse => ({
  ok: true,
  command,
  args: [],
  stdout: "",
  stderr: "",
  exitCode: 0,
  durationMs: 0,
  workingDirectory: "/tmp/workspace",
});

describe("createPostHogToolServices", () => {
  test("records async PostHog operations through the workspace reporter", async () => {
    const recordedOperations: string[] = [];
    const observation: RuntimeObservation = {
      id: "obs_1",
      kind: "posthog-anomaly",
      source: {
        kind: "posthog",
        label: "PostHog",
      },
      summary: "Traffic dipped",
      details: "Traffic dipped in the last hour",
      severity: "warning",
      detectedAt: 1,
    };

    const services = createPostHogToolServices({
      posthogApi: {
        getOrganizations: async () => [{
          id: "org_1",
          name: "Main Org",
          slug: "main-org",
          membershipLevel: 1,
        }],
        getProjects: async (organizationId?: string) => ({
          organizationId: organizationId ?? "org_1",
          projects: [{
            id: 123,
            organizationId: organizationId ?? "org_1",
            name: "Main Project",
            projectToken: "phc_test",
          }],
        }),
        listMcpTools: async () => ({
          total: 1,
          returned: 1,
          tools: [{
            name: "insights-get-all",
            title: "List insights",
            description: "List PostHog insights",
          }],
        }),
        callMcpTool: async (toolName, args) => ({
          toolName,
          text: JSON.stringify(args ?? {}),
          structuredContent: { ok: true },
        }),
        runQuery: async (name) => ({
          name,
          columns: ["value"],
          results: [{ value: 1 }],
        }),
        runInsightQuery: async (name) => ({
          name,
          columns: ["value"],
          results: [{ value: 2 }],
        }),
      },
      posthog: {
        listErrorObservations: async () => [observation],
      },
      posthogCli: {
        listEndpoints: () => createCliResponse("list"),
        diffEndpoints: () => createCliResponse("diff"),
        runEndpoint: () => createCliResponse("run"),
      },
      posthogWorkspaceReporter: {
        record: (operation) => {
          recordedOperations.push(operation);
        },
      },
    });

    expect(await services.getOrganizations()).toHaveLength(1);
    expect((await services.getProjects("org_99")).organizationId).toBe("org_99");
    expect((await services.listMcpTools({ limit: 5 })).tools[0]?.name).toBe("insights-get-all");
    expect((await services.callMcpTool("insights-get-all", { limit: 5 })).toolName).toBe("insights-get-all");
    expect((await services.runQuery("health", "SELECT 1")).results[0]).toEqual({ value: 1 });
    expect(await services.listErrors()).toEqual([observation]);
    expect((await services.getDocumentedToolCatalog()).verifiedAt).toBe("2026-04-01");
    expect((await services.queryInsight("retention", "SELECT 2")).results[0]).toEqual({ value: 2 });

    expect(recordedOperations).toEqual([
      "organizations",
      "projects",
      "mcpTools",
      "mcpCall",
      "query",
      "errors",
      "documentedToolCatalog",
      "insight",
    ]);
  });

  test("records sync endpoint operations through the workspace reporter", () => {
    const recordedOperations: string[] = [];
    const endpointRequest: PostHogEndpointRunRequest = {
      endpointName: "health-check",
      cwd: "/tmp/workspace",
      json: true,
    };

    const services = createPostHogToolServices({
      posthogApi: {
        getOrganizations: async () => [],
        getProjects: async () => ({ organizationId: "org_1", projects: [] }),
        listMcpTools: async () => ({ total: 0, returned: 0, tools: [] }),
        callMcpTool: async (toolName) => ({ toolName, text: "", structuredContent: undefined }),
        runQuery: async (name) => ({ name, columns: [], results: [] }),
        runInsightQuery: async (name) => ({ name, columns: [], results: [] }),
      },
      posthog: {
        listErrorObservations: async () => [],
      },
      posthogCli: {
        listEndpoints: () => createCliResponse("list"),
        diffEndpoints: () => createCliResponse("diff"),
        runEndpoint: () => createCliResponse("run"),
      },
      posthogWorkspaceReporter: {
        record: (operation) => {
          recordedOperations.push(operation);
        },
      },
    });

    expect(services.listEndpoints("/tmp/workspace").command).toBe("list");
    expect(services.diffEndpoints("posthog/endpoints/health.js", "/tmp/workspace").command).toBe("diff");
    expect(services.runEndpoint(endpointRequest).command).toBe("run");
    expect(recordedOperations).toEqual([
      "endpointList",
      "endpointDiff",
      "endpointRun",
    ]);
  });
});
