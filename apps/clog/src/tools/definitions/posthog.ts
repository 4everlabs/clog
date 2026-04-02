import {
  CliCommandResultSchema,
  PostHogCallMcpToolInputSchema,
  PostHogCallMcpToolResultSchema,
  PostHogEndpointDiffInputSchema,
  PostHogEndpointRunInputSchema,
  PostHogGetDashboardSnapshotInputSchema,
  PostHogGetDashboardSnapshotResultSchema,
  PostHogGetDashboardInputSchema,
  PostHogGetDashboardResultSchema,
  PostHogGetDocumentedToolCatalogInputSchema,
  PostHogGetDocumentedToolCatalogResultSchema,
  PostHogGetExperimentInputSchema,
  PostHogGetExperimentResultSchema,
  PostHogGetExperimentResultsInputSchema,
  PostHogGetExperimentResultsResultSchema,
  PostHogGetFeatureFlagBlastRadiusInputSchema,
  PostHogGetFeatureFlagBlastRadiusResultSchema,
  PostHogGetFeatureFlagInputSchema,
  PostHogGetFeatureFlagResultSchema,
  PostHogGetFeatureFlagStatusInputSchema,
  PostHogGetFeatureFlagStatusResultSchema,
  PostHogGetInsightInputSchema,
  PostHogGetInsightResultSchema,
  PostHogGetOrganizationsInputSchema,
  PostHogGetOrganizationsResultSchema,
  PostHogGetProjectsInputSchema,
  PostHogGetProjectsResultSchema,
  PostHogInsightQueryResultSchema,
  PostHogListDashboardsInputSchema,
  PostHogListDashboardsResultSchema,
  PostHogListEndpointsInputSchema,
  PostHogListExperimentsInputSchema,
  PostHogListExperimentsResultSchema,
  PostHogListErrorsInputSchema,
  PostHogListErrorsResultSchema,
  PostHogListFeatureFlagsInputSchema,
  PostHogListFeatureFlagsResultSchema,
  PostHogListInsightsInputSchema,
  PostHogListInsightsResultSchema,
  PostHogListLogAttributesInputSchema,
  PostHogListLogAttributesResultSchema,
  PostHogListMcpToolsInputSchema,
  PostHogListMcpToolsResultSchema,
  PostHogQueryLogsInputSchema,
  PostHogQueryLogsResultSchema,
  PostHogReadDataSchemaInputSchema,
  PostHogReadDataSchemaResultSchema,
  PostHogReadDataWarehouseSchemaInputSchema,
  PostHogReadDataWarehouseSchemaResultSchema,
  PostHogRunQueryInputSchema,
  PostHogSearchDocsInputSchema,
  PostHogSearchDocsResultSchema,
  PostHogSearchEntitiesInputSchema,
  PostHogSearchEntitiesResultSchema,
  PostHogExecuteSqlInputSchema,
  PostHogExecuteSqlResultSchema,
} from "../../schema/tools";
import {
  normalizePostHogDashboard,
  normalizePostHogDashboardList,
  normalizePostHogDocsSearch,
  normalizePostHogExperiment,
  normalizePostHogExperimentResults,
  normalizePostHogExperiments,
  normalizePostHogFeatureFlag,
  normalizePostHogFeatureFlagBlastRadius,
  normalizePostHogFeatureFlagStatus,
  normalizePostHogFeatureFlags,
  normalizePostHogInsight,
  normalizePostHogInsightList,
  normalizePostHogLogAttributes,
  normalizePostHogLogQuery,
  normalizePostHogSchemaEntities,
  normalizePostHogSqlResult,
  normalizePostHogEntityList,
} from "../../integrations/posthog/native-tool-normalizers";
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
    name: "posthog_get_documented_tool_catalog",
    title: "PostHog Documented Tool Catalog",
    description: "Return the PostHog MCP feature and tool catalog curated from official PostHog docs so the model can plan broader product, analytics, and release-management automation.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogGetDocumentedToolCatalogInputSchema,
    outputSchema: PostHogGetDocumentedToolCatalogResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      return await services.posthog.getDocumentedToolCatalog(input);
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
    name: "posthog_get_dashboard_snapshot",
    title: "PostHog Dashboard Snapshot",
    description: "Build a dashboard-grade product and performance snapshot with traffic, exceptions, vitals coverage, slow routes, and anomaly scoring.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogGetDashboardSnapshotInputSchema,
    outputSchema: PostHogGetDashboardSnapshotResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      return await services.posthog.getDashboardSnapshot(input);
    },
  },
  {
    name: "posthog_list_dashboards",
    title: "PostHog List Dashboards",
    description: "List dashboards in the active PostHog project with a stable normalized output.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogListDashboardsInputSchema,
    outputSchema: PostHogListDashboardsResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("dashboards-get-all", {
        limit: input.limit,
        offset: input.offset,
        search: input.search,
        ...input.arguments,
      });
      return normalizePostHogDashboardList(result);
    },
  },
  {
    name: "posthog_get_dashboard",
    title: "PostHog Get Dashboard",
    description: "Fetch a PostHog dashboard by ID with a stable normalized output.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogGetDashboardInputSchema,
    outputSchema: PostHogGetDashboardResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("dashboard-get", {
        id: input.id,
        ...input.arguments,
      });
      return normalizePostHogDashboard(result);
    },
  },
  {
    name: "posthog_list_insights",
    title: "PostHog List Insights",
    description: "List saved insights with a stable normalized output.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogListInsightsInputSchema,
    outputSchema: PostHogListInsightsResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("insights-get-all", {
        limit: input.limit,
        offset: input.offset,
        search: input.search,
        ...input.arguments,
      });
      return normalizePostHogInsightList(result);
    },
  },
  {
    name: "posthog_get_insight",
    title: "PostHog Get Insight",
    description: "Fetch a saved insight by ID with a stable normalized output.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogGetInsightInputSchema,
    outputSchema: PostHogGetInsightResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("insight-get", {
        id: input.id,
        ...input.arguments,
      });
      return normalizePostHogInsight(result);
    },
  },
  {
    name: "posthog_list_feature_flags",
    title: "PostHog List Feature Flags",
    description: "List feature flags with normalized rollout metadata.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogListFeatureFlagsInputSchema,
    outputSchema: PostHogListFeatureFlagsResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadFlags;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("feature-flag-get-all", {
        limit: input.limit,
        offset: input.offset,
        search: input.search,
        ...input.arguments,
      });
      return normalizePostHogFeatureFlags(result);
    },
  },
  {
    name: "posthog_get_feature_flag",
    title: "PostHog Get Feature Flag",
    description: "Fetch a feature flag definition with normalized rollout metadata.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogGetFeatureFlagInputSchema,
    outputSchema: PostHogGetFeatureFlagResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadFlags;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("feature-flag-get-definition", {
        id: input.id,
        ...input.arguments,
      });
      return normalizePostHogFeatureFlag(result);
    },
  },
  {
    name: "posthog_get_feature_flag_status",
    title: "PostHog Feature Flag Status",
    description: "Inspect rollout status and enablement for a feature flag.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogGetFeatureFlagStatusInputSchema,
    outputSchema: PostHogGetFeatureFlagStatusResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadFlags;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("feature-flags-status-retrieve", {
        id: input.id,
        ...input.arguments,
      });
      return normalizePostHogFeatureFlagStatus(result);
    },
  },
  {
    name: "posthog_get_feature_flag_blast_radius",
    title: "PostHog Feature Flag Blast Radius",
    description: "Estimate the potential blast radius of a feature flag rollout.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogGetFeatureFlagBlastRadiusInputSchema,
    outputSchema: PostHogGetFeatureFlagBlastRadiusResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadFlags;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("feature-flags-user-blast-radius-create", {
        id: input.id,
        ...input.arguments,
      });
      return normalizePostHogFeatureFlagBlastRadius(result);
    },
  },
  {
    name: "posthog_list_experiments",
    title: "PostHog List Experiments",
    description: "List experiments with normalized lifecycle and flag linkage metadata.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogListExperimentsInputSchema,
    outputSchema: PostHogListExperimentsResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadExperiments;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("experiment-get-all", {
        limit: input.limit,
        offset: input.offset,
        search: input.search,
        ...input.arguments,
      });
      return normalizePostHogExperiments(result);
    },
  },
  {
    name: "posthog_get_experiment",
    title: "PostHog Get Experiment",
    description: "Fetch experiment details with normalized lifecycle metadata.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogGetExperimentInputSchema,
    outputSchema: PostHogGetExperimentResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadExperiments;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("experiment-get", {
        id: input.id,
        ...input.arguments,
      });
      return normalizePostHogExperiment(result);
    },
  },
  {
    name: "posthog_get_experiment_results",
    title: "PostHog Experiment Results",
    description: "Fetch normalized experiment result summary data.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogGetExperimentResultsInputSchema,
    outputSchema: PostHogGetExperimentResultsResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadExperiments;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("experiment-results-get", {
        id: input.id,
        ...input.arguments,
      });
      return normalizePostHogExperimentResults(result);
    },
  },
  {
    name: "posthog_list_log_attributes",
    title: "PostHog List Log Attributes",
    description: "List available log attributes with normalized previews.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogListLogAttributesInputSchema,
    outputSchema: PostHogListLogAttributesResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadLogs;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("logs-list-attributes", {
        ...input.arguments,
      });
      return normalizePostHogLogAttributes(result);
    },
  },
  {
    name: "posthog_query_logs",
    title: "PostHog Query Logs",
    description: "Query PostHog logs with normalized log entries.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogQueryLogsInputSchema,
    outputSchema: PostHogQueryLogsResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadLogs;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("logs-query", {
        query: input.query,
        limit: input.limit,
        level: input.level,
        service: input.service,
        from: input.from,
        to: input.to,
        ...input.arguments,
      });
      return normalizePostHogLogQuery(result);
    },
  },
  {
    name: "posthog_search_entities",
    title: "PostHog Entity Search",
    description: "Search PostHog entities with normalized search results.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogSearchEntitiesInputSchema,
    outputSchema: PostHogSearchEntitiesResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("entity-search", {
        query: input.query,
        kind: input.kind,
        limit: input.limit,
        ...input.arguments,
      });
      const normalized = normalizePostHogEntityList(result, ["results", "entities", "items", "data"]);
      return {
        text: normalized.text,
        total: normalized.total,
        entities: normalized.entities,
      };
    },
  },
  {
    name: "posthog_read_data_schema",
    title: "PostHog Data Schema",
    description: "Explore PostHog data schema with normalized entity summaries.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogReadDataSchemaInputSchema,
    outputSchema: PostHogReadDataSchemaResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("read-data-schema", {
        search: input.search,
        limit: input.limit,
        ...input.arguments,
      });
      return normalizePostHogSchemaEntities(result, ["events", "actions", "properties", "results", "items"]);
    },
  },
  {
    name: "posthog_read_data_warehouse_schema",
    title: "PostHog Data Warehouse Schema",
    description: "Read PostHog data warehouse schemas with normalized table summaries.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogReadDataWarehouseSchemaInputSchema,
    outputSchema: PostHogReadDataWarehouseSchemaResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("read-data-warehouse-schema", {
        search: input.search,
        limit: input.limit,
        ...input.arguments,
      });
      return normalizePostHogSchemaEntities(result, ["tables", "schemas", "results", "items"]);
    },
  },
  {
    name: "posthog_execute_sql",
    title: "PostHog Execute SQL",
    description: "Execute SQL directly against PostHog and normalize tabular results.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogExecuteSqlInputSchema,
    outputSchema: PostHogExecuteSqlResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("execute-sql", {
        query: input.query,
        ...input.arguments,
      });
      return normalizePostHogSqlResult(result);
    },
  },
  {
    name: "posthog_search_docs",
    title: "PostHog Docs Search",
    description: "Search PostHog docs and normalize matching results.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogSearchDocsInputSchema,
    outputSchema: PostHogSearchDocsResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      if (!services.posthog) {
        throw new Error("PostHog services are unavailable");
      }

      const result = await services.posthog.callMcpTool("docs-search", {
        query: input.query,
        ...input.arguments,
      });
      return normalizePostHogDocsSearch(result);
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
