import { buildPostHogDashboardSnapshot } from "./dashboard-snapshot";
import { getPostHogDocumentedToolCatalog } from "./documented-tool-catalog";
import type { PostHogApiClient } from "./api-client";
import type { PostHogIntegrationClient } from "./client";
import type { PostHogCliTool } from "./cli-tool";
import type { PostHogWorkspaceReporter } from "./workspace-reporter";
import type { PostHogToolServices } from "../../tools/types";

export interface CreatePostHogToolServicesDependencies {
  readonly posthogApi: Pick<
    PostHogApiClient,
    "getOrganizations" | "getProjects" | "listMcpTools" | "callMcpTool" | "runQuery" | "runInsightQuery"
  >;
  readonly posthog: Pick<PostHogIntegrationClient, "listErrorObservations">;
  readonly posthogCli: Pick<PostHogCliTool, "listEndpoints" | "diffEndpoints" | "runEndpoint">;
  readonly posthogWorkspaceReporter: Pick<PostHogWorkspaceReporter, "record">;
}

const recordAsync = async <T>(
  posthogWorkspaceReporter: Pick<PostHogWorkspaceReporter, "record">,
  operation: string,
  execute: () => Promise<T>,
): Promise<T> => {
  const result = await execute();
  posthogWorkspaceReporter.record(operation, result);
  return result;
};

const recordSync = <T>(
  posthogWorkspaceReporter: Pick<PostHogWorkspaceReporter, "record">,
  operation: string,
  execute: () => T,
): T => {
  const result = execute();
  posthogWorkspaceReporter.record(operation, result);
  return result;
};

export const createPostHogToolServices = ({
  posthogApi,
  posthog,
  posthogCli,
  posthogWorkspaceReporter,
}: CreatePostHogToolServicesDependencies): PostHogToolServices => ({
  getOrganizations: async () => await recordAsync(
    posthogWorkspaceReporter,
    "organizations",
    async () => await posthogApi.getOrganizations(),
  ),
  getProjects: async (organizationId?: string) => await recordAsync(
    posthogWorkspaceReporter,
    "projects",
    async () => await posthogApi.getProjects(organizationId),
  ),
  listMcpTools: async (input) => await recordAsync(
    posthogWorkspaceReporter,
    "mcpTools",
    async () => await posthogApi.listMcpTools(input),
  ),
  callMcpTool: async (toolName: string, args?: Record<string, unknown>) => await recordAsync(
    posthogWorkspaceReporter,
    "mcpCall",
    async () => await posthogApi.callMcpTool(toolName, args),
  ),
  runQuery: async (name: string, query: string, refresh?: string) => await recordAsync(
    posthogWorkspaceReporter,
    "query",
    async () => await posthogApi.runQuery(name, query, refresh),
  ),
  listErrors: async () => await recordAsync(
    posthogWorkspaceReporter,
    "errors",
    async () => await posthog.listErrorObservations(),
  ),
  getDashboardSnapshot: async (input = {}) => await recordAsync(
    posthogWorkspaceReporter,
    "dashboardSnapshot",
    async () => await buildPostHogDashboardSnapshot({
      windowMinutes: input.windowMinutes,
      topPathsLimit: input.topPathsLimit,
      runQuery: async (name, query) => await posthogApi.runQuery(name, query),
    }),
  ),
  getDocumentedToolCatalog: async (input = {}) => await recordAsync(
    posthogWorkspaceReporter,
    "documentedToolCatalog",
    async () => {
      const liveCatalog = await posthogApi.listMcpTools({
        limit: 200,
      });
      return getPostHogDocumentedToolCatalog(input, {
        tools: liveCatalog.tools,
      });
    },
  ),
  queryInsight: async (name: string, query: string) => await recordAsync(
    posthogWorkspaceReporter,
    "insight",
    async () => await posthogApi.runInsightQuery(name, query),
  ),
  listEndpoints: (cwd?: string) => recordSync(
    posthogWorkspaceReporter,
    "endpointList",
    () => posthogCli.listEndpoints(cwd),
  ),
  diffEndpoints: (path: string, cwd?: string) => recordSync(
    posthogWorkspaceReporter,
    "endpointDiff",
    () => posthogCli.diffEndpoints(path, cwd),
  ),
  runEndpoint: (input) => recordSync(
    posthogWorkspaceReporter,
    "endpointRun",
    () => posthogCli.runEndpoint(input),
  ),
});
