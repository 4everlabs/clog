import {
  CliCommandResultSchema,
  PostHogCallMcpToolInputSchema,
  PostHogCallMcpToolResultSchema,
  PostHogEndpointDiffInputSchema,
  PostHogEndpointRunInputSchema,
  PostHogGetDashboardSnapshotInputSchema,
  PostHogGetDashboardSnapshotResultSchema,
  PostHogGetAssetSummaryInputSchema,
  PostHogGetAssetSummaryResultSchema,
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
  PostHogGetHealthSummaryInputSchema,
  PostHogGetHealthSummaryResultSchema,
  PostHogGetInfoInputSchema,
  PostHogGetInfoResultSchema,
  PostHogGetInsightInputSchema,
  PostHogGetInsightResultSchema,
  PostHogGetOrganizationsInputSchema,
  PostHogGetOrganizationsResultSchema,
  PostHogGetProjectsInputSchema,
  PostHogGetProjectsResultSchema,
  PostHogGetReleaseSummaryInputSchema,
  PostHogGetReleaseSummaryResultSchema,
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
  normalizePostHogEntityList,
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
} from "../../integrations/posthog/native-tool-normalizers";
import {
  buildPostHogAssetSummary,
  buildPostHogHealthSummary,
  buildPostHogReleaseSummary,
} from "../../integrations/posthog/summary-builders";
import type { RuntimeObservation } from "@clog/types";
import type { RegisteredTool } from "../types";
import { buildTimeRangeDescriptor, resolveTimeRangeWindowMinutes } from "../time-range";

type PostHogToolMetadata = Pick<RegisteredTool, "exposureTier" | "capabilityGroup">;

const posthogToolMetadata: Record<
  | "posthog_get_organizations"
  | "posthog_get_projects"
  | "posthog_list_errors"
  | "posthog_get_documented_tool_catalog"
  | "posthog_list_mcp_tools"
  | "posthog_call_mcp_tool"
  | "posthog_run_query"
  | "posthog_get_dashboard_snapshot"
  | "posthog_get_info"
  | "posthog_get_health_summary"
  | "posthog_get_asset_summary"
  | "posthog_get_release_summary"
  | "posthog_list_dashboards"
  | "posthog_get_dashboard"
  | "posthog_list_insights"
  | "posthog_get_insight"
  | "posthog_list_feature_flags"
  | "posthog_get_feature_flag"
  | "posthog_get_feature_flag_status"
  | "posthog_get_feature_flag_blast_radius"
  | "posthog_list_experiments"
  | "posthog_get_experiment"
  | "posthog_get_experiment_results"
  | "posthog_list_log_attributes"
  | "posthog_query_logs"
  | "posthog_search_entities"
  | "posthog_read_data_schema"
  | "posthog_read_data_warehouse_schema"
  | "posthog_execute_sql"
  | "posthog_search_docs"
  | "posthog_list_endpoints"
  | "posthog_diff_endpoints"
  | "posthog_run_endpoint",
  PostHogToolMetadata
> = {
  posthog_get_organizations: { exposureTier: "internal", capabilityGroup: "workspace" },
  posthog_get_projects: { exposureTier: "internal", capabilityGroup: "workspace" },
  posthog_list_errors: { exposureTier: "core", capabilityGroup: "investigation" },
  posthog_get_documented_tool_catalog: { exposureTier: "core", capabilityGroup: "workspace" },
  posthog_list_mcp_tools: { exposureTier: "core", capabilityGroup: "workspace" },
  posthog_call_mcp_tool: { exposureTier: "core", capabilityGroup: "workspace" },
  posthog_run_query: { exposureTier: "discoverable", capabilityGroup: "analytics_buildout" },
  posthog_get_dashboard_snapshot: { exposureTier: "core", capabilityGroup: "investigation" },
  posthog_get_info: { exposureTier: "core", capabilityGroup: "investigation" },
  posthog_get_health_summary: { exposureTier: "core", capabilityGroup: "investigation" },
  posthog_get_asset_summary: { exposureTier: "core", capabilityGroup: "investigation" },
  posthog_get_release_summary: { exposureTier: "core", capabilityGroup: "release_safety" },
  posthog_list_dashboards: { exposureTier: "internal", capabilityGroup: "investigation" },
  posthog_get_dashboard: { exposureTier: "internal", capabilityGroup: "investigation" },
  posthog_list_insights: { exposureTier: "internal", capabilityGroup: "analytics_buildout" },
  posthog_get_insight: { exposureTier: "internal", capabilityGroup: "analytics_buildout" },
  posthog_list_feature_flags: { exposureTier: "internal", capabilityGroup: "release_safety" },
  posthog_get_feature_flag: { exposureTier: "internal", capabilityGroup: "release_safety" },
  posthog_get_feature_flag_status: { exposureTier: "internal", capabilityGroup: "release_safety" },
  posthog_get_feature_flag_blast_radius: { exposureTier: "internal", capabilityGroup: "release_safety" },
  posthog_list_experiments: { exposureTier: "internal", capabilityGroup: "release_safety" },
  posthog_get_experiment: { exposureTier: "internal", capabilityGroup: "release_safety" },
  posthog_get_experiment_results: { exposureTier: "internal", capabilityGroup: "release_safety" },
  posthog_list_log_attributes: { exposureTier: "internal", capabilityGroup: "investigation" },
  posthog_query_logs: { exposureTier: "internal", capabilityGroup: "investigation" },
  posthog_search_entities: { exposureTier: "discoverable", capabilityGroup: "analytics_buildout" },
  posthog_read_data_schema: { exposureTier: "discoverable", capabilityGroup: "analytics_buildout" },
  posthog_read_data_warehouse_schema: { exposureTier: "discoverable", capabilityGroup: "analytics_buildout" },
  posthog_execute_sql: { exposureTier: "discoverable", capabilityGroup: "analytics_buildout" },
  posthog_search_docs: { exposureTier: "discoverable", capabilityGroup: "analytics_buildout" },
  posthog_list_endpoints: { exposureTier: "internal", capabilityGroup: "automation" },
  posthog_diff_endpoints: { exposureTier: "internal", capabilityGroup: "automation" },
  posthog_run_endpoint: { exposureTier: "internal", capabilityGroup: "automation" },
};

const toRecord = (entries: readonly { key: string; value: string }[] | undefined): Record<string, string> | undefined => {
  if (!entries || entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
};

const buildPostHogHealthSummaryData = async (
  services: Parameters<NonNullable<RegisteredTool["execute"]>>[0],
  input: {
    readonly context?: string;
    readonly timePreset?: "last_hour" | "last_12_hours" | "last_24_hours";
    readonly windowMinutes?: number;
    readonly topPathsLimit?: number;
    readonly reportLimit?: number;
    readonly operationHistoryLimit?: number;
  },
) => {
  if (!services.posthog) {
    throw new Error("PostHog services are unavailable");
  }

  if (!services.runtime) {
    throw new Error("Runtime services are unavailable");
  }

  const timeRange = buildTimeRangeDescriptor(input.timePreset, input.windowMinutes);
  const windowMinutes = resolveTimeRangeWindowMinutes(input.timePreset, input.windowMinutes);
  const [dashboard, monitoring] = await Promise.all([
    services.posthog.getDashboardSnapshot({
      windowMinutes,
      topPathsLimit: input.topPathsLimit,
    }),
    Promise.resolve(services.runtime.getMonitoringSnapshot({
      reportLimit: input.reportLimit,
      operationHistoryLimit: input.operationHistoryLimit,
    })),
  ]);

  return buildPostHogHealthSummary(dashboard, {
    latestPerformanceReport: monitoring.latestPerformanceReport,
    recentPostHogOperations: monitoring.recentPostHogOperations,
  }, {
    context: input.context ?? null,
    timeRange,
  });
};

const buildPostHogAssetSummaryData = async (
  services: Parameters<NonNullable<RegisteredTool["execute"]>>[0],
  input: {
    readonly context?: string;
    readonly dashboardLimit?: number;
    readonly insightLimit?: number;
    readonly entitySearchQuery?: string;
    readonly entitySearchLimit?: number;
    readonly schemaSearch?: string;
    readonly schemaLimit?: number;
  },
) => {
  if (!services.posthog) {
    throw new Error("PostHog services are unavailable");
  }

  const dashboardLimit = input.dashboardLimit ?? 12;
  const insightLimit = input.insightLimit ?? 12;
  const generatedAt = Date.now();

  let dashboardList = normalizePostHogDashboardList({
    text: "",
    structuredContent: { dashboards: [] },
  });
  try {
    dashboardList = normalizePostHogDashboardList(await services.posthog.callMcpTool("dashboards-get-all", {
      limit: dashboardLimit,
      offset: 0,
    }));
  } catch {
    dashboardList = { total: 0, dashboards: [], text: undefined };
  }

  let insightList = normalizePostHogInsightList({
    text: "",
    structuredContent: { insights: [] },
  });
  try {
    insightList = normalizePostHogInsightList(await services.posthog.callMcpTool("insights-get-all", {
      limit: insightLimit,
      offset: 0,
    }));
  } catch {
    insightList = { total: 0, insights: [], text: undefined };
  }

  let entityHits = normalizePostHogEntityList({ text: "", structuredContent: { results: [] } }, ["results"]);
  if (input.entitySearchQuery) {
    try {
      entityHits = normalizePostHogEntityList(await services.posthog.callMcpTool("entity-search", {
        query: input.entitySearchQuery,
        limit: input.entitySearchLimit ?? 12,
      }), ["results", "entities", "items", "data"]);
    } catch {
      entityHits = { total: 0, entities: [], text: undefined };
    }
  } else {
    entityHits = { total: 0, entities: [], text: undefined };
  }

  let schemaEntities = normalizePostHogSchemaEntities({ text: "", structuredContent: {} }, ["events"]);
  if (input.schemaSearch) {
    try {
      schemaEntities = normalizePostHogSchemaEntities(await services.posthog.callMcpTool("read-data-schema", {
        search: input.schemaSearch,
        limit: input.schemaLimit ?? 20,
      }), ["events", "actions", "properties", "results", "items"]);
    } catch {
      schemaEntities = { total: 0, entities: [], text: undefined, raw: undefined };
    }
  } else {
    schemaEntities = { total: 0, entities: [], text: undefined, raw: undefined };
  }

  return buildPostHogAssetSummary({
    dashboards: dashboardList.dashboards.map((dashboard) => ({
      id: dashboard.id,
      name: dashboard.name,
    })),
    insights: insightList.insights.map((insight) => ({
      id: insight.id,
      name: insight.name,
    })),
    entityHits: entityHits.entities.map((entity) => ({
      id: entity.id,
      type: entity.type,
      name: entity.name,
    })),
    schemaEntities: schemaEntities.entities.map((entity) => ({
      name: entity.name,
      kind: entity.kind,
    })),
    totals: {
      dashboardsListed: dashboardList.total,
      insightsListed: insightList.total,
      entityHits: entityHits.total,
      schemaEntities: schemaEntities.total,
    },
  }, generatedAt, {
    context: input.context ?? null,
    timeRange: buildTimeRangeDescriptor(),
  });
};

const buildPostHogReleaseSummaryData = async (
  services: Parameters<NonNullable<RegisteredTool["execute"]>>[0],
  input: {
    readonly context?: string;
    readonly timePreset?: "last_hour" | "last_12_hours" | "last_24_hours";
    readonly windowMinutes?: number;
    readonly flagLimit?: number;
    readonly experimentLimit?: number;
    readonly includeErrorObservations?: boolean;
    readonly observationLimit?: number;
    readonly includeLogAttributes?: boolean;
    readonly logAttributeLimit?: number;
  },
) => {
  if (!services.posthog) {
    throw new Error("PostHog services are unavailable");
  }

  const flagLimit = input.flagLimit ?? 30;
  const experimentLimit = input.experimentLimit ?? 30;
  const observationLimit = input.observationLimit ?? 10;
  const logAttributeLimit = input.logAttributeLimit ?? 15;
  const generatedAt = Date.now();

  let flags = normalizePostHogFeatureFlags({ text: "", structuredContent: { flags: [] } });
  try {
    flags = normalizePostHogFeatureFlags(await services.posthog.callMcpTool("feature-flag-get-all", {
      limit: flagLimit,
      offset: 0,
    }));
  } catch {
    flags = { total: 0, flags: [], text: undefined };
  }

  let experiments = normalizePostHogExperiments({ text: "", structuredContent: { experiments: [] } });
  try {
    experiments = normalizePostHogExperiments(await services.posthog.callMcpTool("experiment-get-all", {
      limit: experimentLimit,
      offset: 0,
    }));
  } catch {
    experiments = { total: 0, experiments: [], text: undefined };
  }

  let observations: readonly RuntimeObservation[] = [];
  if (input.includeErrorObservations) {
    try {
      observations = await services.posthog.listErrors();
    } catch {
      observations = [];
    }
  }

  let logAttributes = normalizePostHogLogAttributes({ text: "", structuredContent: { attributes: [] } });
  if (input.includeLogAttributes) {
    try {
      logAttributes = normalizePostHogLogAttributes(await services.posthog.callMcpTool("logs-list-attributes", {}));
    } catch {
      logAttributes = { total: 0, attributes: [], text: undefined };
    }
  }

  const errorObservations = (input.includeErrorObservations ? observations : [])
    .slice(0, observationLimit)
    .map((observation, index) => ({
      id: observation.id.trim().length > 0 ? observation.id : `observation_${index}`,
      severity: observation.severity,
      summary: observation.summary,
    }));

  const logAttributeRows = (input.includeLogAttributes ? logAttributes.attributes : [])
    .slice(0, logAttributeLimit)
    .map((attribute) => ({
      key: attribute.key,
      type: attribute.type,
    }));

  return buildPostHogReleaseSummary({
    flags: flags.flags.map((flag) => ({
      key: flag.key,
      name: flag.name,
      active: flag.active,
      rolloutPercentage: flag.rolloutPercentage,
      status: flag.status,
    })),
    experiments: experiments.experiments.map((experiment) => ({
      id: experiment.id,
      name: experiment.name,
      status: experiment.status,
      featureFlagKey: experiment.featureFlagKey,
    })),
    errorObservations,
    logAttributes: logAttributeRows,
    totals: {
      flags: flags.total,
      experiments: experiments.total,
      errorObservations: input.includeErrorObservations ? observations.length : 0,
      logAttributes: input.includeLogAttributes ? logAttributes.total : 0,
    },
  }, generatedAt, {
    context: input.context ?? null,
    timeRange: buildTimeRangeDescriptor(input.timePreset, input.windowMinutes),
  });
};

const basePosthogTools = [
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

      return await services.posthog.getDashboardSnapshot({
        windowMinutes: resolveTimeRangeWindowMinutes(input.timePreset, input.windowMinutes),
        topPathsLimit: input.topPathsLimit,
      });
    },
  },
  {
    name: "posthog_get_info",
    title: "PostHog Get Info",
    description: "Generic PostHog info entrypoint that resolves a context-aware health, asset, or release summary and points to the focused follow-up tools.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogGetInfoInputSchema,
    outputSchema: PostHogGetInfoResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      const suggestedTools = input.kind === "health"
        ? ["posthog_get_health_summary", "posthog_get_dashboard_snapshot", "posthog_list_errors"]
        : input.kind === "assets"
          ? ["posthog_get_asset_summary", "posthog_get_documented_tool_catalog", "posthog_call_mcp_tool"]
          : ["posthog_get_release_summary", "posthog_get_documented_tool_catalog", "posthog_call_mcp_tool"];

      const data = input.kind === "health"
        ? await buildPostHogHealthSummaryData(services, input)
        : input.kind === "assets"
          ? await buildPostHogAssetSummaryData(services, input)
          : await buildPostHogReleaseSummaryData(services, input);

      return {
        generatedAt: data.generatedAt,
        kind: input.kind,
        context: input.context?.trim() || null,
        timeRange: data.timeRange,
        suggestedTools,
        printout: data.printout,
        data,
      };
    },
  },
  {
    name: "posthog_get_health_summary",
    title: "PostHog Health Summary",
    description: "Compact product and reliability summary combining the dashboard snapshot with retained runtime monitoring artifacts.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogGetHealthSummaryInputSchema,
    outputSchema: PostHogGetHealthSummaryResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      return await buildPostHogHealthSummaryData(services, input);
    },
  },
  {
    name: "posthog_get_asset_summary",
    title: "PostHog Asset Summary",
    description: "Condensed view of dashboards, insights, optional entity search hits, and optional data schema matches.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogGetAssetSummaryInputSchema,
    outputSchema: PostHogGetAssetSummaryResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      return await buildPostHogAssetSummaryData(services, input);
    },
  },
  {
    name: "posthog_get_release_summary",
    title: "PostHog Release Summary",
    description: "Compact flags, experiments, and optional error or log-attribute context for release and rollout reviews.",
    integration: "posthog",
    approvalRequired: false,
    implemented: true,
    inputSchema: PostHogGetReleaseSummaryInputSchema,
    outputSchema: PostHogGetReleaseSummaryResultSchema,
    isEnabled(capabilities) {
      return capabilities.posthog.canReadInsights;
    },
    async execute(services, input) {
      return await buildPostHogReleaseSummaryData(services, input);
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
] as const satisfies readonly Omit<RegisteredTool, "exposureTier" | "capabilityGroup">[];

export const posthogTools: readonly RegisteredTool[] = basePosthogTools.map((tool) => ({
  ...posthogToolMetadata[tool.name],
  ...tool,
}));
