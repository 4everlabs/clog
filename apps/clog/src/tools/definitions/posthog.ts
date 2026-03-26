import {
  CliCommandResultSchema,
  PostHogCallMcpToolInputSchema,
  PostHogCallMcpToolResultSchema,
  PostHogEndpointDiffInputSchema,
  PostHogEndpointRunInputSchema,
  PostHogGetOrganizationsInputSchema,
  PostHogGetOrganizationsResultSchema,
  PostHogGetProjectsInputSchema,
  PostHogGetProjectsResultSchema,
  PostHogInsightQueryResultSchema,
  PostHogListEndpointsInputSchema,
  PostHogListErrorsInputSchema,
  PostHogListErrorsResultSchema,
  PostHogListMcpToolsInputSchema,
  PostHogListMcpToolsResultSchema,
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
    name: "posthog_list_errors",
    title: "PostHog Error Observations",
    description: "List active PostHog error tracking issues from the project-pinned MCP session.",
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
    name: "posthog_list_mcp_tools",
    title: "PostHog MCP Tool Catalog",
    description: "List the full PostHog MCP tool catalog currently available to this project-pinned session. Use this to discover supported tool names and optionally inspect input schemas.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogListMcpToolsInputSchema,
    outputSchema: PostHogListMcpToolsResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      return await services.posthog.listMcpTools(input);
    },
  },
  {
    name: "posthog_call_mcp_tool",
    title: "PostHog MCP Tool Call",
    description: "Call any available PostHog MCP tool directly by name with JSON arguments. Use `posthog_list_mcp_tools` first when you need to discover the exact tool name or schema.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogCallMcpToolInputSchema,
    outputSchema: PostHogCallMcpToolResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      return await services.posthog.callMcpTool(input.toolName, input.arguments);
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
    name: "posthog_list_endpoints",
    title: "PostHog Endpoint List",
    description: "List PostHog endpoints available from the configured runtime workspace.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogListEndpointsInputSchema,
    outputSchema: CliCommandResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canManageEndpoints;
    },
    execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      return services.posthog.listEndpoints(input.cwd);
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
