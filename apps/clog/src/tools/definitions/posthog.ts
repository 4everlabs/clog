import {
  CliCommandResultSchema,
  PostHogEndpointDiffInputSchema,
  PostHogEndpointRunInputSchema,
  PostHogGetOrganizationsInputSchema,
  PostHogGetOrganizationsResultSchema,
  PostHogGetProjectsInputSchema,
  PostHogGetProjectsResultSchema,
  PostHogInsightQueryInputSchema,
  PostHogInsightQueryResultSchema,
  PostHogListErrorsInputSchema,
  PostHogListErrorsResultSchema,
  PostHogRunQueryInputSchema,
} from "../../schema/tools";
import type { RegisteredTool } from "../types";

const toRecord = (entries: readonly { key: string; value: string }[] | undefined): Record<string, string> | undefined => {
  if (!entries || entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
};

export const posthogTools = [
  {
    name: "posthog_get_organizations",
    title: "PostHog Organizations",
    description: "List the PostHog organizations available to the configured personal API key.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogGetOrganizationsInputSchema,
    outputSchema: PostHogGetOrganizationsResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      return {
        organizations: await services.posthog.getOrganizations(),
      };
    },
  },
  {
    name: "posthog_get_projects",
    title: "PostHog Projects",
    description: "List PostHog projects for an organization. If organizationId is omitted, the first accessible organization is used.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogGetProjectsInputSchema,
    outputSchema: PostHogGetProjectsResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      return await services.posthog.getProjects(input.organizationId);
    },
  },
  {
    name: "posthog_run_query",
    title: "PostHog HogQL Query",
    description: "Run a typed PostHog HogQL query against the configured project using the project query API.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogRunQueryInputSchema,
    outputSchema: PostHogInsightQueryResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      return await services.posthog.runQuery(input.name, input.query, input.refresh);
    },
  },
  {
    name: "posthog_list_errors",
    title: "PostHog Error Observations",
    description: "List current PostHog error observations that the runtime has permission to read.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogListErrorsInputSchema,
    outputSchema: PostHogListErrorsResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadErrors;
    },
    async execute(services) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      return {
        observations: await services.posthog.listErrors(),
      };
    },
  },
  {
    name: "posthog_query_insight",
    title: "PostHog Insight Query",
    description: "Run a typed PostHog insight query by name and query string.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogInsightQueryInputSchema,
    outputSchema: PostHogInsightQueryResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      return await services.posthog.queryInsight(input.name, input.query);
    },
  },
  {
    name: "posthog_diff_endpoints",
    title: "PostHog Endpoint Diff",
    description: "Run a PostHog endpoint diff command inside the approved runtime roots.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogEndpointDiffInputSchema,
    outputSchema: CliCommandResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canManageEndpoints;
    },
    execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      return services.posthog.diffEndpoints(input.path, input.cwd);
    },
  },
  {
    name: "posthog_run_endpoint",
    title: "PostHog Endpoint Run",
    description: "Run a PostHog endpoint command using either an endpoint name or a file path.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogEndpointRunInputSchema,
    outputSchema: CliCommandResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canManageEndpoints;
    },
    execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      return services.posthog.runEndpoint({
        ...input,
        variables: toRecord(input.variables),
      });
    },
  },
] as const satisfies readonly RegisteredTool[];
