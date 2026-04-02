export interface PostHogDocumentedTool {
  readonly name: string;
  readonly purpose: string;
}

export interface PostHogDocumentedFeatureCatalog {
  readonly feature: string;
  readonly title: string;
  readonly description: string;
  readonly docsUrl: string | null;
  readonly priority: "core" | "high" | "extended";
  readonly tools: readonly PostHogDocumentedTool[];
}

export interface PostHogDocumentedToolCatalog {
  readonly verifiedAt: string;
  readonly sources: readonly string[];
  readonly serverUrls: {
    readonly us: string;
    readonly eu: string;
  };
  readonly pinning: {
    readonly supportedHeaders: readonly string[];
    readonly supportedQueryParameters: readonly string[];
  };
  readonly featureFilterExample: string;
  readonly apiPrimitives: ReadonlyArray<{
    readonly name: string;
    readonly purpose: string;
  }>;
  readonly recommendedBuildOrder: ReadonlyArray<{
    readonly surface: string;
    readonly why: string;
    readonly features: readonly string[];
  }>;
  readonly features: readonly PostHogDocumentedFeatureCatalog[];
}

const features: readonly PostHogDocumentedFeatureCatalog[] = [
  {
    feature: "workspace",
    title: "Workspace",
    description: "Organization and project context selection.",
    docsUrl: null,
    priority: "core",
    tools: [
      { name: "organization-details-get", purpose: "Get the active organization details." },
      { name: "organizations-get", purpose: "List organizations the user can access." },
      { name: "projects-get", purpose: "List projects in the active organization." },
      { name: "property-definitions", purpose: "Read event and property definitions for the project." },
      { name: "switch-organization", purpose: "Change the active organization." },
      { name: "switch-project", purpose: "Change the active project." },
    ],
  },
  {
    feature: "insights",
    title: "Insights",
    description: "Analytics insights, queries, and saved report management.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "core",
    tools: [
      { name: "insight-create-from-query", purpose: "Save a query as an insight." },
      { name: "insight-delete", purpose: "Delete an insight." },
      { name: "insight-get", purpose: "Fetch a specific insight." },
      { name: "insight-query", purpose: "Execute an existing insight query." },
      { name: "insight-update", purpose: "Update an insight." },
      { name: "insights-get-all", purpose: "List insights in the project." },
      { name: "query-generate-hogql-from-question", purpose: "Generate HogQL from a natural language question." },
      { name: "query-run", purpose: "Run trend, funnel, paths, or HogQL queries." },
    ],
  },
  {
    feature: "dashboards",
    title: "Dashboards",
    description: "Dashboard creation, retrieval, and tile ordering.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "core",
    tools: [
      { name: "dashboard-create", purpose: "Create a dashboard." },
      { name: "dashboard-delete", purpose: "Delete a dashboard." },
      { name: "dashboard-get", purpose: "Get a dashboard." },
      { name: "dashboard-reorder-tiles", purpose: "Reorder dashboard tiles." },
      { name: "dashboard-update", purpose: "Update a dashboard." },
      { name: "dashboards-get-all", purpose: "List dashboards." },
    ],
  },
  {
    feature: "flags",
    title: "Feature Flags",
    description: "Feature flag lifecycle, rollout analysis, and scheduled changes.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "core",
    tools: [
      { name: "create-feature-flag", purpose: "Create a feature flag." },
      { name: "delete-feature-flag", purpose: "Delete a feature flag." },
      { name: "feature-flag-get-all", purpose: "List feature flags." },
      { name: "feature-flag-get-definition", purpose: "Get a feature flag definition." },
      { name: "feature-flags-activity-retrieve", purpose: "Get feature flag activity." },
      { name: "feature-flags-copy-flags-create", purpose: "Copy a flag across projects." },
      { name: "feature-flags-dependent-flags-retrieve", purpose: "Get dependent flags." },
      { name: "feature-flags-evaluation-reasons-retrieve", purpose: "Get evaluation reasons." },
      { name: "feature-flags-status-retrieve", purpose: "Get flag rollout status." },
      { name: "feature-flags-user-blast-radius-create", purpose: "Estimate blast radius." },
      { name: "scheduled-changes-create", purpose: "Create a scheduled flag change." },
      { name: "scheduled-changes-delete", purpose: "Delete a scheduled change." },
      { name: "scheduled-changes-get", purpose: "Get a scheduled change." },
      { name: "scheduled-changes-list", purpose: "List scheduled changes." },
      { name: "scheduled-changes-update", purpose: "Update a scheduled change." },
      { name: "update-feature-flag", purpose: "Update a feature flag." },
    ],
  },
  {
    feature: "experiments",
    title: "Experiments",
    description: "A/B testing setup, lifecycle management, and results.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "core",
    tools: [
      { name: "experiment-create", purpose: "Create an experiment with metrics and flag setup." },
      { name: "experiment-delete", purpose: "Delete an experiment." },
      { name: "experiment-get", purpose: "Get experiment details." },
      { name: "experiment-get-all", purpose: "List experiments." },
      { name: "experiment-results-get", purpose: "Get experiment results and exposure data." },
      { name: "experiment-update", purpose: "Update or restart an experiment." },
    ],
  },
  {
    feature: "error_tracking",
    title: "Error Tracking",
    description: "Error issue triage, details, and issue state management.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "core",
    tools: [
      { name: "error-details", purpose: "Get error details." },
      { name: "error-tracking-issues-list", purpose: "List error tracking issues." },
      { name: "error-tracking-issues-partial-update", purpose: "Update an issue." },
      { name: "error-tracking-issues-retrieve", purpose: "Get an issue." },
      { name: "list-errors", purpose: "List project errors." },
      { name: "update-issue-status", purpose: "Update issue status." },
    ],
  },
  {
    feature: "logs",
    title: "Logs",
    description: "Log search, attribute discovery, and attribute value lookups.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "high",
    tools: [
      { name: "logs-list-attribute-values", purpose: "List values for a log attribute." },
      { name: "logs-list-attributes", purpose: "List available log attributes." },
      { name: "logs-query", purpose: "Search and query logs." },
    ],
  },
  {
    feature: "sql",
    title: "SQL",
    description: "Direct SQL execution against PostHog data.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "high",
    tools: [
      { name: "execute-sql", purpose: "Execute a SQL query." },
    ],
  },
  {
    feature: "data_schema",
    title: "Data Schema",
    description: "Explore event, property, and warehouse schemas.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "high",
    tools: [
      { name: "read-data-schema", purpose: "Explore events, actions, properties, and values." },
      { name: "read-data-warehouse-schema", purpose: "Read warehouse schemas and tables." },
    ],
  },
  {
    feature: "events",
    title: "Events and Properties",
    description: "Event definition management and property listing.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "high",
    tools: [
      { name: "event-definition-update", purpose: "Update event definition metadata." },
      { name: "event-definitions-list", purpose: "List event definitions." },
      { name: "properties-list", purpose: "List event or person properties." },
    ],
  },
  {
    feature: "persons",
    title: "Persons",
    description: "Person lookup, cohort membership, and property operations.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "high",
    tools: [
      { name: "persons-bulk-delete", purpose: "Bulk delete persons." },
      { name: "persons-cohorts-retrieve", purpose: "Get person cohorts." },
      { name: "persons-list", purpose: "List persons." },
      { name: "persons-property-delete", purpose: "Delete person property." },
      { name: "persons-property-set", purpose: "Set person property." },
      { name: "persons-retrieve", purpose: "Get a person." },
      { name: "persons-values-retrieve", purpose: "Get person property values." },
    ],
  },
  {
    feature: "cohorts",
    title: "Cohorts",
    description: "Cohort creation, retrieval, and static cohort membership changes.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "high",
    tools: [
      { name: "cohorts-add-persons-to-static-cohort-partial-update", purpose: "Add persons to a static cohort." },
      { name: "cohorts-create", purpose: "Create a cohort." },
      { name: "cohorts-list", purpose: "List cohorts." },
      { name: "cohorts-partial-update", purpose: "Update a cohort." },
      { name: "cohorts-retrieve", purpose: "Get a cohort." },
      { name: "cohorts-rm-person-from-static-cohort-partial-update", purpose: "Remove a person from a static cohort." },
    ],
  },
  {
    feature: "alerts",
    title: "Alerts",
    description: "Insight alert creation, simulation, and management.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "high",
    tools: [
      { name: "alert-create", purpose: "Create an alert." },
      { name: "alert-delete", purpose: "Delete an alert." },
      { name: "alert-get", purpose: "Get an alert." },
      { name: "alert-simulate", purpose: "Simulate a detector on an insight." },
      { name: "alert-update", purpose: "Update an alert." },
      { name: "alerts-list", purpose: "List alerts." },
    ],
  },
  {
    feature: "annotations",
    title: "Annotations",
    description: "Mark releases and product events on insights.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "high",
    tools: [
      { name: "annotation-create", purpose: "Create an annotation." },
      { name: "annotation-delete", purpose: "Delete an annotation." },
      { name: "annotation-retrieve", purpose: "Get an annotation." },
      { name: "annotations-list", purpose: "List annotations." },
      { name: "annotations-partial-update", purpose: "Update an annotation." },
    ],
  },
  {
    feature: "search",
    title: "Search",
    description: "Entity search across the project.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "high",
    tools: [
      { name: "entity-search", purpose: "Search entities by name or description." },
    ],
  },
  {
    feature: "docs",
    title: "Docs Search",
    description: "Search PostHog documentation from the MCP server.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "high",
    tools: [
      { name: "docs-search", purpose: "Search PostHog documentation." },
    ],
  },
  {
    feature: "data_warehouse",
    title: "Data Warehouse",
    description: "Saved query lifecycle and materialization management.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "extended",
    tools: [
      { name: "view-create", purpose: "Create a saved query." },
      { name: "view-delete", purpose: "Delete a saved query." },
      { name: "view-get", purpose: "Get a saved query." },
      { name: "view-list", purpose: "List saved queries." },
      { name: "view-materialize", purpose: "Materialize a saved query." },
      { name: "view-run", purpose: "Run a saved query." },
      { name: "view-run-history", purpose: "Get saved query run history." },
      { name: "view-unmaterialize", purpose: "Revert materialization." },
      { name: "view-update", purpose: "Update a saved query." },
    ],
  },
  {
    feature: "llm_analytics",
    title: "LLM Analytics",
    description: "Evaluations, traces, prompts, and project cost reporting for AI features.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "extended",
    tools: [
      { name: "evaluation-create", purpose: "Create an evaluation." },
      { name: "evaluation-delete", purpose: "Delete an evaluation." },
      { name: "evaluation-get", purpose: "Get an evaluation." },
      { name: "evaluation-run", purpose: "Run an evaluation for an event." },
      { name: "evaluation-update", purpose: "Update an evaluation." },
      { name: "evaluations-get", purpose: "List evaluations." },
      { name: "get-llm-total-costs-for-project", purpose: "Fetch daily LLM costs by model." },
      { name: "query-traces-list", purpose: "List LLM traces." },
      { name: "prompt-create", purpose: "Create a prompt." },
      { name: "prompt-duplicate", purpose: "Duplicate a prompt." },
      { name: "prompt-get", purpose: "Get a prompt." },
      { name: "prompt-list", purpose: "List prompts." },
      { name: "prompt-update", purpose: "Update a prompt." },
    ],
  },
  {
    feature: "surveys",
    title: "Surveys",
    description: "Survey CRUD and response statistics.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "extended",
    tools: [
      { name: "survey-create", purpose: "Create a survey." },
      { name: "survey-delete", purpose: "Delete a survey." },
      { name: "survey-get", purpose: "Get a survey." },
      { name: "survey-stats", purpose: "Get survey response statistics." },
      { name: "survey-update", purpose: "Update a survey." },
      { name: "surveys-get-all", purpose: "List surveys." },
      { name: "surveys-global-stats", purpose: "Get aggregated survey statistics." },
    ],
  },
  {
    feature: "hog_functions",
    title: "Hog Functions and Workflows",
    description: "CDP functions, templates, invocation testing, and workflow discovery.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "extended",
    tools: [
      { name: "cdp-function-templates-list", purpose: "List function templates." },
      { name: "cdp-function-templates-retrieve", purpose: "Get a function template." },
      { name: "cdp-functions-create", purpose: "Create a function." },
      { name: "cdp-functions-delete", purpose: "Delete a function." },
      { name: "cdp-functions-invocations-create", purpose: "Test invoke a function." },
      { name: "cdp-functions-list", purpose: "List functions." },
      { name: "cdp-functions-partial-update", purpose: "Update a function." },
      { name: "cdp-functions-rearrange-partial-update", purpose: "Reorder function execution." },
      { name: "cdp-functions-retrieve", purpose: "Get a function." },
      { name: "workflows-get", purpose: "Get a workflow." },
      { name: "workflows-list", purpose: "List workflows." },
    ],
  },
  {
    feature: "actions",
    title: "Actions",
    description: "Action definition management.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "extended",
    tools: [
      { name: "action-create", purpose: "Create an action." },
      { name: "action-delete", purpose: "Delete an action." },
      { name: "action-get", purpose: "Get an action." },
      { name: "action-update", purpose: "Update an action." },
      { name: "actions-get-all", purpose: "List actions." },
    ],
  },
  {
    feature: "activity_logs",
    title: "Activity Logs",
    description: "Activity log viewing.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "extended",
    tools: [
      { name: "activity-logs-list", purpose: "List activity logs." },
    ],
  },
  {
    feature: "early_access_features",
    title: "Early Access Features",
    description: "Early access feature rollout management.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "extended",
    tools: [
      { name: "early-access-feature-create", purpose: "Create an early access feature." },
      { name: "early-access-feature-destroy", purpose: "Delete an early access feature." },
      { name: "early-access-feature-list", purpose: "List early access features." },
      { name: "early-access-feature-partial-update", purpose: "Update an early access feature." },
      { name: "early-access-feature-retrieve", purpose: "Get an early access feature." },
    ],
  },
  {
    feature: "notebooks",
    title: "Notebooks",
    description: "Notebook lifecycle management.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "extended",
    tools: [
      { name: "notebooks-create", purpose: "Create a notebook." },
      { name: "notebooks-destroy", purpose: "Delete a notebook." },
      { name: "notebooks-list", purpose: "List notebooks." },
      { name: "notebooks-partial-update", purpose: "Update a notebook." },
      { name: "notebooks-retrieve", purpose: "Get a notebook." },
    ],
  },
  {
    feature: "reverse_proxy",
    title: "Reverse Proxy",
    description: "Reverse proxy record management.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "extended",
    tools: [
      { name: "proxy-create", purpose: "Create a reverse proxy." },
      { name: "proxy-delete", purpose: "Delete a reverse proxy." },
      { name: "proxy-get", purpose: "Get reverse proxy details." },
      { name: "proxy-list", purpose: "List reverse proxies." },
      { name: "proxy-retry", purpose: "Retry reverse proxy provisioning." },
    ],
  },
  {
    feature: "debug",
    title: "Debug",
    description: "Diagnostic utilities for MCP Apps SDK testing.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    priority: "extended",
    tools: [
      { name: "debug-mcp-ui-apps", purpose: "Run diagnostic MCP UI app debugging." },
    ],
  },
];

export const POSTHOG_DOCUMENTED_TOOL_CATALOG: PostHogDocumentedToolCatalog = {
  verifiedAt: "2026-04-01",
  sources: [
    "https://posthog.com/docs/model-context-protocol",
    "https://posthog.com/",
  ],
  serverUrls: {
    us: "https://mcp.posthog.com/mcp",
    eu: "https://mcp-eu.posthog.com/mcp",
  },
  pinning: {
    supportedHeaders: ["x-posthog-organization-id", "x-posthog-project-id"],
    supportedQueryParameters: ["organization_id", "project_id"],
  },
  featureFilterExample: "https://mcp.posthog.com/mcp?features=flags,experiments,insights",
  apiPrimitives: [
    { name: "capture", purpose: "Send events, identify users, update properties, and modify groups." },
    { name: "query", purpose: "Run embedded analytics and custom reports." },
    { name: "flags", purpose: "Evaluate feature flags via API." },
    { name: "batch", purpose: "Batch migrate events from other tools." },
    { name: "annotations", purpose: "Programmatically mark release and product inflection points." },
    { name: "hogql/sql", purpose: "Join, filter, and analyze data directly with SQL access." },
  ],
  recommendedBuildOrder: [
    {
      surface: "operator-triage",
      why: "This is the fastest path to production-grade monitoring and incident investigation.",
      features: ["workspace", "insights", "dashboards", "error_tracking", "logs", "alerts", "search", "docs"],
    },
    {
      surface: "release-safety",
      why: "These tools let the model ship safer changes and reason about blast radius and rollback options.",
      features: ["flags", "experiments", "annotations", "cohorts", "persons"],
    },
    {
      surface: "data-and-growth",
      why: "These are high leverage once the monitoring baseline is stable.",
      features: ["data_schema", "sql", "data_warehouse", "surveys", "llm_analytics"],
    },
    {
      surface: "automation",
      why: "Useful later, but should come after the read-heavy and release-safety surfaces are solid.",
      features: ["hog_functions", "actions", "workflows", "reverse_proxy", "early_access_features", "notebooks"],
    },
  ],
  features,
};

export const getPostHogDocumentedToolCatalog = (input: {
  readonly feature?: string;
  readonly priority?: "core" | "high" | "extended";
  readonly includeExtended?: boolean;
} = {}): PostHogDocumentedToolCatalog => {
  const requestedFeature = input.feature?.trim().toLowerCase();
  const includeExtended = input.includeExtended !== false;
  const requestedPriority = input.priority;

  const filteredFeatures = features.filter((feature) => {
    if (!includeExtended && feature.priority === "extended") {
      return false;
    }
    if (requestedPriority && feature.priority !== requestedPriority) {
      return false;
    }
    if (requestedFeature && feature.feature !== requestedFeature) {
      return false;
    }
    return true;
  });

  return {
    ...POSTHOG_DOCUMENTED_TOOL_CATALOG,
    features: filteredFeatures,
  };
};
