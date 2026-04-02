import { z } from "zod";
import type {
  NotionTodoItem,
  NotionTodoStatusCount,
  NotionTodoSummary,
  PostHogOrganizationSummary,
  PostHogProjectSummary,
} from "@clog/types";

const JsonRecordSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());

export const RuntimeToolsConfigSchema = z.object({
  posthog: z.object({
    readInsights: z.boolean().optional(),
    readErrors: z.boolean().optional(),
    readLogs: z.boolean().optional(),
    readFlags: z.boolean().optional(),
    readExperiments: z.boolean().optional(),
    manageEndpoints: z.boolean().optional(),
  }).strict().optional(),
  github: z.object({
    readRepository: z.boolean().optional(),
    createPullRequests: z.boolean().optional(),
    pushBranches: z.boolean().optional(),
  }).strict().optional(),
  vercel: z.object({
    triggerDeploys: z.boolean().optional(),
  }).strict().optional(),
  chat: z.object({
    notifyOperator: z.boolean().optional(),
  }).strict().optional(),
  notion: z.object({
    readTodo: z.boolean().optional(),
  }).strict().optional(),
  shell: z.object({
    execute: z.boolean().optional(),
  }).strict().optional(),
}).strict();

export type RuntimeToolsConfig = z.infer<typeof RuntimeToolsConfigSchema>;

export const NormalizedRuntimeToolsConfigSchema = z.object({
  posthog: z.object({
    readInsights: z.boolean(),
    readErrors: z.boolean(),
    readLogs: z.boolean(),
    readFlags: z.boolean(),
    readExperiments: z.boolean(),
    manageEndpoints: z.boolean(),
  }).strict(),
  github: z.object({
    readRepository: z.boolean(),
    createPullRequests: z.boolean(),
    pushBranches: z.boolean(),
  }).strict(),
  vercel: z.object({
    triggerDeploys: z.boolean(),
  }).strict(),
  chat: z.object({
    notifyOperator: z.boolean(),
  }).strict(),
  notion: z.object({
    readTodo: z.boolean(),
  }).strict(),
  shell: z.object({
    execute: z.boolean(),
  }).strict(),
}).strict();

export type NormalizedRuntimeToolsConfig = z.infer<typeof NormalizedRuntimeToolsConfigSchema>;

export const ToolFamilySchema = z.enum(["posthog", "github", "vercel", "notion", "runtime", "shell"]);
export type ToolFamily = z.infer<typeof ToolFamilySchema>;

export const AgentToolNameSchema = z.enum([
  "posthog_get_organizations",
  "posthog_get_projects",
  "posthog_list_errors",
  "posthog_run_query",
  "posthog_get_dashboard_snapshot",
  "posthog_get_documented_tool_catalog",
  "posthog_list_dashboards",
  "posthog_get_dashboard",
  "posthog_list_insights",
  "posthog_get_insight",
  "posthog_list_feature_flags",
  "posthog_get_feature_flag",
  "posthog_get_feature_flag_status",
  "posthog_get_feature_flag_blast_radius",
  "posthog_list_experiments",
  "posthog_get_experiment",
  "posthog_get_experiment_results",
  "posthog_list_log_attributes",
  "posthog_query_logs",
  "posthog_search_entities",
  "posthog_read_data_schema",
  "posthog_read_data_warehouse_schema",
  "posthog_execute_sql",
  "posthog_search_docs",
  "posthog_list_mcp_tools",
  "posthog_call_mcp_tool",
  "posthog_list_endpoints",
  "posthog_diff_endpoints",
  "posthog_run_endpoint",
  "notion_get_todo_list",
  "runtime_get_state_snapshot",
  "runtime_get_recent_logs",
  "runtime_get_monitoring_snapshot",
  "runtime_list_actions",
  "runtime_run_action",
  "runtime_list_routines",
  "runtime_run_routine",
  "runtime_read_knowledge",
  "shell_execute_command",
  "github_read_repository",
  "github_create_pull_request",
  "vercel_trigger_deploy",
]);

export type AgentToolName = z.infer<typeof AgentToolNameSchema>;

export const ToolSummarySchema = z.object({
  name: AgentToolNameSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  integration: ToolFamilySchema,
  approvalRequired: z.boolean(),
  implemented: z.boolean(),
}).strict();

export type ToolSummary = z.infer<typeof ToolSummarySchema>;

export const ObservationSourceSchema = z.object({
  kind: z.enum(["posthog", "github", "vercel", "chat", "runtime"]),
  label: z.string(),
  referenceId: z.string().optional(),
  url: z.string().optional(),
}).strict();

export const KeyValueEntrySchema = z.object({
  key: z.string().min(1),
  value: z.string(),
}).strict();

export const RuntimeObservationSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "runtime-health",
    "posthog-anomaly",
    "error-rate-spike",
    "insight-regression",
    "repo-risk",
    "deploy-risk",
    "manual-note",
  ]),
  source: ObservationSourceSchema,
  summary: z.string(),
  details: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  detectedAt: z.number(),
  metadata: JsonRecordSchema.optional(),
}).strict();

export const PostHogInsightQueryInputSchema = z.object({
  name: z.string().min(1),
  query: z.string().min(1),
}).strict();

export const PostHogInsightQueryResultSchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
  results: z.array(JsonRecordSchema),
}).strict();

const PostHogOrganizationSummarySchema: z.ZodType<PostHogOrganizationSummary> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  membershipLevel: z.number().int().nullable(),
}).strict();

const PostHogProjectSummarySchema: z.ZodType<PostHogProjectSummary> = z.object({
  id: z.number().int().nonnegative(),
  organizationId: z.string().min(1).nullable(),
  name: z.string().min(1),
  projectToken: z.string().min(1).nullable(),
}).strict();

export const PostHogGetOrganizationsInputSchema = z.object({}).strict();

export const PostHogGetOrganizationsResultSchema = z.object({
  organizations: z.array(PostHogOrganizationSummarySchema),
}).strict();

export const PostHogGetProjectsInputSchema = z.object({
  organizationId: z.string().min(1).optional(),
}).strict();

export const PostHogGetProjectsResultSchema = z.object({
  organizationId: z.string().min(1),
  projects: z.array(PostHogProjectSummarySchema),
}).strict();

export const PostHogRunQueryInputSchema = z.object({
  name: z.string().min(1),
  query: z.string().min(1),
  refresh: z.enum([
    "blocking",
    "async",
    "force_blocking",
    "force_async",
    "force_cache",
    "lazy_async",
    "async_except_on_cache_miss",
  ]).optional(),
}).strict();

const PostHogDashboardPerformanceRowSchema = z.object({
  path: z.string().min(1),
  valueMs: z.number(),
  samples: z.number().int().nonnegative(),
  status: z.enum(["good", "slow"]),
}).strict();

const PostHogDashboardTopPathSchema = z.object({
  path: z.string().min(1),
  pageviews: z.number().int().nonnegative(),
}).strict();

const PostHogDashboardAnomalySchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "traffic-drop",
    "exception-spike",
    "slow-lcp",
    "slow-inp",
    "weak-web-vitals-coverage",
  ]),
  severity: z.enum(["warning", "critical"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  metric: z.string().min(1),
  currentValue: z.number(),
  previousValue: z.number().nullable(),
  threshold: z.number(),
  path: z.string().nullable(),
}).strict();

export const PostHogGetDashboardSnapshotInputSchema = z.object({
  windowMinutes: z.number().int().positive().max(1_440).optional(),
  topPathsLimit: z.number().int().positive().max(20).optional(),
}).strict();

export const PostHogGetDashboardSnapshotResultSchema = z.object({
  generatedAt: z.number().int().nonnegative(),
  windowMinutes: z.number().int().positive(),
  summary: z.object({
    pageviews: z.number().int().nonnegative(),
    uniqueVisitors: z.number().int().nonnegative(),
    webVitalsEvents: z.number().int().nonnegative(),
    exceptionEvents: z.number().int().nonnegative(),
    distinctExceptionIssues: z.number().int().nonnegative(),
    webVitalsCoverageRatio: z.number(),
    errorRatePer1kPageviews: z.number(),
    slowLcpPages: z.number().int().nonnegative(),
    slowInpPages: z.number().int().nonnegative(),
    productionReadinessScore: z.number().int().min(0).max(100),
    anomalyCount: z.number().int().nonnegative(),
  }).strict(),
  previousWindow: z.object({
    pageviews: z.number().int().nonnegative(),
    webVitalsEvents: z.number().int().nonnegative(),
    exceptionEvents: z.number().int().nonnegative(),
    pageviewsDeltaPercent: z.number().nullable(),
    webVitalsDeltaPercent: z.number().nullable(),
    exceptionDeltaPercent: z.number().nullable(),
  }).strict(),
  topPaths: z.array(PostHogDashboardTopPathSchema),
  lcp: z.array(PostHogDashboardPerformanceRowSchema),
  inp: z.array(PostHogDashboardPerformanceRowSchema),
  anomalies: z.array(PostHogDashboardAnomalySchema),
}).strict();

const PostHogDocumentedToolSchema = z.object({
  name: z.string().min(1),
  purpose: z.string().min(1),
}).strict();

const PostHogDocumentedFeatureCatalogSchema = z.object({
  feature: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  docsUrl: z.string().url().nullable(),
  priority: z.enum(["core", "high", "extended"]),
  tools: z.array(PostHogDocumentedToolSchema),
}).strict();

export const PostHogGetDocumentedToolCatalogInputSchema = z.object({
  feature: z.string().min(1).optional(),
  priority: z.enum(["core", "high", "extended"]).optional(),
  includeExtended: z.boolean().optional(),
}).strict();

export const PostHogGetDocumentedToolCatalogResultSchema = z.object({
  verifiedAt: z.string().min(1),
  sources: z.array(z.string().url()),
  serverUrls: z.object({
    us: z.string().url(),
    eu: z.string().url(),
  }).strict(),
  pinning: z.object({
    supportedHeaders: z.array(z.string().min(1)),
    supportedQueryParameters: z.array(z.string().min(1)),
  }).strict(),
  featureFilterExample: z.string().url(),
  apiPrimitives: z.array(z.object({
    name: z.string().min(1),
    purpose: z.string().min(1),
  }).strict()),
  recommendedBuildOrder: z.array(z.object({
    surface: z.string().min(1),
    why: z.string().min(1),
    features: z.array(z.string().min(1)),
  }).strict()),
  features: z.array(PostHogDocumentedFeatureCatalogSchema),
}).strict();

export const PostHogMcpAliasInputSchema = z.object({}).catchall(z.unknown());

const PostHogMcpArgumentsSchema = z.object({}).catchall(z.unknown());

const PostHogListResourceInputSchema = z.object({
  limit: z.number().int().positive().max(200).optional(),
  offset: z.number().int().nonnegative().optional(),
  search: z.string().min(1).optional(),
  arguments: PostHogMcpArgumentsSchema.optional(),
}).strict();

const PostHogGetResourceByIdInputSchema = z.object({
  id: z.union([z.string().min(1), z.number().int().nonnegative()]),
  arguments: PostHogMcpArgumentsSchema.optional(),
}).strict();

const PostHogDashboardSummarySchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  url: z.string().nullable(),
  tags: z.array(z.string()),
  raw: z.unknown(),
}).strict();

const PostHogInsightSummarySchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  queryKind: z.string().nullable(),
  url: z.string().nullable(),
  raw: z.unknown(),
}).strict();

const PostHogFeatureFlagSummarySchema = z.object({
  id: z.string().nullable(),
  key: z.string().nullable(),
  name: z.string().nullable(),
  status: z.string().nullable(),
  active: z.boolean().nullable(),
  rolloutPercentage: z.number().nullable(),
  url: z.string().nullable(),
  raw: z.unknown(),
}).strict();

const PostHogExperimentSummarySchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  status: z.string().nullable(),
  featureFlagKey: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  url: z.string().nullable(),
  raw: z.unknown(),
}).strict();

const PostHogLogAttributeSchema = z.object({
  key: z.string().min(1),
  type: z.string().nullable(),
  valuesPreview: z.array(z.string()),
  raw: z.unknown(),
}).strict();

const PostHogLogEntrySchema = z.object({
  id: z.string().nullable(),
  timestamp: z.string().nullable(),
  level: z.string().nullable(),
  message: z.string().nullable(),
  service: z.string().nullable(),
  traceId: z.string().nullable(),
  attributes: JsonRecordSchema,
  raw: z.unknown(),
}).strict();

const PostHogNamedEntitySchema = z.object({
  id: z.string().nullable(),
  type: z.string().nullable(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  url: z.string().nullable(),
  raw: z.unknown(),
}).strict();

const PostHogSchemaEntitySchema = z.object({
  name: z.string().min(1),
  kind: z.string().nullable(),
  description: z.string().nullable(),
  raw: z.unknown(),
}).strict();

const PostHogDocsSearchResultSchema = z.object({
  title: z.string().nullable(),
  url: z.string().nullable(),
  snippet: z.string().nullable(),
  raw: z.unknown(),
}).strict();

export const PostHogListDashboardsInputSchema = PostHogListResourceInputSchema;
export const PostHogListDashboardsResultSchema = z.object({
  text: z.string().optional(),
  total: z.number().int().nonnegative(),
  dashboards: z.array(PostHogDashboardSummarySchema),
}).strict();

export const PostHogGetDashboardInputSchema = PostHogGetResourceByIdInputSchema;
export const PostHogGetDashboardResultSchema = z.object({
  text: z.string().optional(),
  dashboard: PostHogDashboardSummarySchema.nullable(),
}).strict();

export const PostHogListInsightsInputSchema = PostHogListResourceInputSchema;
export const PostHogListInsightsResultSchema = z.object({
  text: z.string().optional(),
  total: z.number().int().nonnegative(),
  insights: z.array(PostHogInsightSummarySchema),
}).strict();

export const PostHogGetInsightInputSchema = PostHogGetResourceByIdInputSchema;
export const PostHogGetInsightResultSchema = z.object({
  text: z.string().optional(),
  insight: PostHogInsightSummarySchema.nullable(),
}).strict();

export const PostHogListFeatureFlagsInputSchema = PostHogListResourceInputSchema;
export const PostHogListFeatureFlagsResultSchema = z.object({
  text: z.string().optional(),
  total: z.number().int().nonnegative(),
  flags: z.array(PostHogFeatureFlagSummarySchema),
}).strict();

export const PostHogGetFeatureFlagInputSchema = PostHogGetResourceByIdInputSchema;
export const PostHogGetFeatureFlagResultSchema = z.object({
  text: z.string().optional(),
  flag: PostHogFeatureFlagSummarySchema.nullable(),
}).strict();

export const PostHogGetFeatureFlagStatusInputSchema = PostHogGetResourceByIdInputSchema;
export const PostHogGetFeatureFlagStatusResultSchema = z.object({
  text: z.string().optional(),
  flagId: z.string().nullable(),
  status: z.string().nullable(),
  enabled: z.boolean().nullable(),
  summary: z.string().nullable(),
  raw: z.unknown().optional(),
}).strict();

export const PostHogGetFeatureFlagBlastRadiusInputSchema = PostHogGetResourceByIdInputSchema;
export const PostHogGetFeatureFlagBlastRadiusResultSchema = z.object({
  text: z.string().optional(),
  flagId: z.string().nullable(),
  estimatedAffectedUsers: z.number().nullable(),
  summary: z.string().nullable(),
  raw: z.unknown().optional(),
}).strict();

export const PostHogListExperimentsInputSchema = PostHogListResourceInputSchema;
export const PostHogListExperimentsResultSchema = z.object({
  text: z.string().optional(),
  total: z.number().int().nonnegative(),
  experiments: z.array(PostHogExperimentSummarySchema),
}).strict();

export const PostHogGetExperimentInputSchema = PostHogGetResourceByIdInputSchema;
export const PostHogGetExperimentResultSchema = z.object({
  text: z.string().optional(),
  experiment: PostHogExperimentSummarySchema.nullable(),
}).strict();

export const PostHogGetExperimentResultsInputSchema = PostHogGetResourceByIdInputSchema;
export const PostHogGetExperimentResultsResultSchema = z.object({
  text: z.string().optional(),
  experimentId: z.string().nullable(),
  status: z.string().nullable(),
  winningVariant: z.string().nullable(),
  exposureCount: z.number().nullable(),
  significance: z.number().nullable(),
  summary: z.string().nullable(),
  raw: z.unknown().optional(),
}).strict();

export const PostHogListLogAttributesInputSchema = z.object({
  arguments: PostHogMcpArgumentsSchema.optional(),
}).strict();
export const PostHogListLogAttributesResultSchema = z.object({
  text: z.string().optional(),
  total: z.number().int().nonnegative(),
  attributes: z.array(PostHogLogAttributeSchema),
}).strict();

export const PostHogQueryLogsInputSchema = z.object({
  query: z.string().min(1).optional(),
  limit: z.number().int().positive().max(500).optional(),
  level: z.string().min(1).optional(),
  service: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  arguments: PostHogMcpArgumentsSchema.optional(),
}).strict();
export const PostHogQueryLogsResultSchema = z.object({
  text: z.string().optional(),
  total: z.number().int().nonnegative(),
  entries: z.array(PostHogLogEntrySchema),
}).strict();

export const PostHogSearchEntitiesInputSchema = z.object({
  query: z.string().min(1),
  kind: z.string().min(1).optional(),
  limit: z.number().int().positive().max(200).optional(),
  arguments: PostHogMcpArgumentsSchema.optional(),
}).strict();
export const PostHogSearchEntitiesResultSchema = z.object({
  text: z.string().optional(),
  total: z.number().int().nonnegative(),
  entities: z.array(PostHogNamedEntitySchema),
}).strict();

export const PostHogReadDataSchemaInputSchema = z.object({
  search: z.string().min(1).optional(),
  limit: z.number().int().positive().max(200).optional(),
  arguments: PostHogMcpArgumentsSchema.optional(),
}).strict();
export const PostHogReadDataSchemaResultSchema = z.object({
  text: z.string().optional(),
  total: z.number().int().nonnegative(),
  entities: z.array(PostHogSchemaEntitySchema),
  raw: z.unknown().optional(),
}).strict();

export const PostHogReadDataWarehouseSchemaInputSchema = z.object({
  search: z.string().min(1).optional(),
  limit: z.number().int().positive().max(200).optional(),
  arguments: PostHogMcpArgumentsSchema.optional(),
}).strict();
export const PostHogReadDataWarehouseSchemaResultSchema = z.object({
  text: z.string().optional(),
  total: z.number().int().nonnegative(),
  entities: z.array(PostHogSchemaEntitySchema),
  raw: z.unknown().optional(),
}).strict();

export const PostHogExecuteSqlInputSchema = z.object({
  query: z.string().min(1),
  arguments: PostHogMcpArgumentsSchema.optional(),
}).strict();
export const PostHogExecuteSqlResultSchema = z.object({
  text: z.string().optional(),
  columns: z.array(z.string()),
  rows: z.array(JsonRecordSchema),
  raw: z.unknown().optional(),
}).strict();

export const PostHogSearchDocsInputSchema = z.object({
  query: z.string().min(1),
  arguments: PostHogMcpArgumentsSchema.optional(),
}).strict();
export const PostHogSearchDocsResultSchema = z.object({
  text: z.string().optional(),
  total: z.number().int().nonnegative(),
  results: z.array(PostHogDocsSearchResultSchema),
}).strict();

export const PostHogListErrorsInputSchema = z.object({}).strict();

export const PostHogListErrorsResultSchema = z.object({
  observations: z.array(RuntimeObservationSchema),
}).strict();

export const PostHogListMcpToolsInputSchema = z.object({
  nameFilter: z.string().min(1).optional(),
  includeInputSchema: z.boolean().optional(),
  limit: z.number().int().positive().max(200).optional(),
}).strict();

export const PostHogMcpToolSchema = z.object({
  name: z.string().min(1),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  inputSchema: z.unknown().optional(),
}).strict();

export const PostHogListMcpToolsResultSchema = z.object({
  total: z.number().int().nonnegative(),
  returned: z.number().int().nonnegative(),
  tools: z.array(PostHogMcpToolSchema),
}).strict();

export const PostHogCallMcpToolInputSchema = z.object({
  toolName: z.string().min(1),
  arguments: z.object({}).catchall(z.unknown()).optional(),
}).strict();

export const PostHogCallMcpToolResultSchema = z.object({
  toolName: z.string().min(1),
  text: z.string(),
  structuredContent: z.unknown().optional(),
}).strict();

export const NotionTodoStatusCountSchema: z.ZodType<NotionTodoStatusCount> = z.object({
  progress: z.string().min(1),
  count: z.number().int().nonnegative(),
}).strict();

export const NotionTodoItemSchema: z.ZodType<NotionTodoItem> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  progress: z.string().nullable(),
  dueDate: z.string().nullable(),
  assignees: z.array(z.string()),
  taskTypes: z.array(z.string()),
  url: z.string().url(),
}).strict();

export const NotionTodoSummarySchema: z.ZodType<NotionTodoSummary> = z.object({
  title: z.string().min(1),
  dataSourceId: z.string().min(1),
  generatedAt: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  openCount: z.number().int().nonnegative(),
  statusCounts: z.array(NotionTodoStatusCountSchema),
}).strict();

export const NotionGetTodoListInputSchema = z.object({
  includeDone: z.boolean().optional(),
  limit: z.number().int().positive().max(200).optional(),
  progress: z.array(z.string().min(1)).max(20).optional(),
}).strict();

export const NotionGetTodoListResultSchema = z.object({
  summary: NotionTodoSummarySchema,
  items: z.array(NotionTodoItemSchema),
  printout: z.string().min(1),
}).strict();

const RuntimeSnapshotFindingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  severity: z.enum(["info", "warning", "critical"]),
  summary: z.string(),
  lastSeenAt: z.number().int().nonnegative(),
}).strict();

const RuntimeSnapshotMessageSchema = z.object({
  role: z.enum(["system", "user", "agent"]),
  content: z.string(),
  createdAt: z.number().int().nonnegative(),
}).strict();

const RuntimeSnapshotThreadSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  channel: z.enum(["web", "telegram", "tui", "system"]),
  updatedAt: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(),
  messages: z.array(RuntimeSnapshotMessageSchema),
}).strict();

const RuntimeSnapshotMemorySchema = z.object({
  id: z.string().min(1),
  type: z.enum(["observation", "finding", "conversation", "insight"]),
  importance: z.number(),
  content: z.string(),
  createdAt: z.number().int().nonnegative(),
}).strict();

const RuntimeSnapshotActionResultSchema = z.object({
  actionId: z.string().min(1),
  state: z.enum(["pending", "requires-approval", "running", "completed", "failed"]),
  summary: z.string(),
}).strict();

export const RuntimeGetStateSnapshotInputSchema = z.object({
  threadLimit: z.number().int().positive().max(20).optional(),
  messageLimitPerThread: z.number().int().positive().max(50).optional(),
  findingLimit: z.number().int().positive().max(20).optional(),
  memoryLimit: z.number().int().positive().max(20).optional(),
  actionResultLimit: z.number().int().positive().max(20).optional(),
}).strict();

export const RuntimeGetStateSnapshotResultSchema = z.object({
  generatedAt: z.number().int().nonnegative(),
  status: z.enum(["booting", "idle", "monitoring", "degraded"]),
  openFindingsCount: z.number().int().nonnegative(),
  openFindings: z.array(RuntimeSnapshotFindingSchema),
  recentThreads: z.array(RuntimeSnapshotThreadSchema),
  recentMemories: z.array(RuntimeSnapshotMemorySchema),
  recentActionResults: z.array(RuntimeSnapshotActionResultSchema),
}).strict();

const RuntimeRecentLogFileSchema = z.object({
  fileName: z.string().min(1),
  relativePath: z.string().min(1),
  totalLines: z.number().int().nonnegative(),
  returnedLines: z.number().int().nonnegative(),
  truncated: z.boolean(),
  content: z.string(),
}).strict();

export const RuntimeGetRecentLogsInputSchema = z.object({
  fileLimit: z.number().int().positive().max(10).optional(),
  lineLimit: z.number().int().positive().max(400).optional(),
  pathContains: z.string().min(1).optional(),
}).strict();

export const RuntimeGetRecentLogsResultSchema = z.object({
  generatedAt: z.number().int().nonnegative(),
  files: z.array(RuntimeRecentLogFileSchema),
}).strict();

export const RuntimeGetMonitoringSnapshotInputSchema = z.object({
  reportLimit: z.number().int().positive().max(10).optional(),
  operationHistoryLimit: z.number().int().positive().max(20).optional(),
}).strict();

const RuntimeMonitoringOperationRecordSchema = z.object({
  recordedAt: z.number().int().nonnegative(),
  data: z.unknown(),
}).strict();

const RuntimeMonitoringOperationSchema = z.object({
  operation: z.string().min(1),
  lastRecordedAt: z.number().int().nonnegative(),
  history: z.array(RuntimeMonitoringOperationRecordSchema),
}).strict();

const RuntimeMonitoringReportSchema = z.object({
  fileName: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  report: z.unknown(),
}).strict();

export const RuntimeGetMonitoringSnapshotResultSchema = z.object({
  generatedAt: z.number().int().nonnegative(),
  latestPerformanceReport: z.unknown().nullable(),
  recentPerformanceReports: z.array(RuntimeMonitoringReportSchema),
  recentPostHogOperations: z.array(RuntimeMonitoringOperationSchema),
}).strict();

export const RuntimeReadKnowledgeInputSchema = z.object({
  path: z.string().min(1).optional(),
  maxChars: z.number().int().positive().max(20_000).optional(),
}).strict();

export const RuntimeReadKnowledgeResultSchema = z.object({
  availablePaths: z.array(z.string().min(1)),
  selectedPath: z.string().min(1).nullable(),
  content: z.string().nullable(),
  truncated: z.boolean(),
}).strict();

export const PostHogListEndpointsInputSchema = z.object({
  cwd: z.string().optional(),
}).strict();

export const PostHogEndpointDiffInputSchema = z.object({
  path: z.string().min(1),
  cwd: z.string().optional(),
}).strict();

export const PostHogEndpointRunInputSchema = z.object({
  endpointName: z.string().min(1).optional(),
  filePath: z.string().min(1).optional(),
  cwd: z.string().optional(),
  variables: z.array(KeyValueEntrySchema).optional(),
  json: z.boolean().optional(),
}).strict().refine(
  (value) => Boolean(value.endpointName || value.filePath),
  "Either endpointName or filePath is required",
);

export const CliCommandResultSchema = z.object({
  ok: z.boolean(),
  command: z.string(),
  args: z.array(z.string()),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
  durationMs: z.number(),
  workingDirectory: z.string(),
  parsedJson: z.unknown().optional(),
}).strict();

export const ShellExecuteInputSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.array(KeyValueEntrySchema).optional(),
}).strict();

export const ShellExecuteResultSchema = z.object({
  ok: z.boolean(),
  command: z.string(),
  args: z.array(z.string()),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
  durationMs: z.number(),
  workingDirectory: z.string(),
}).strict();

export const GitHubReadRepositoryInputSchema = z.object({
  question: z.string().min(1),
}).strict();

export const GitHubReadRepositoryResultSchema = z.object({
  ok: z.boolean(),
  summary: z.string(),
}).strict();

export const GitHubCreatePullRequestInputSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
}).strict();

export const GitHubCreatePullRequestResultSchema = z.object({
  ok: z.boolean(),
  summary: z.string(),
}).strict();

export const VercelTriggerDeployInputSchema = z.object({
  target: z.string().min(1).optional(),
}).strict();

export const VercelTriggerDeployResultSchema = z.object({
  ok: z.boolean(),
  summary: z.string(),
}).strict();

export const ToolExecutionErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
}).strict();

const RuntimeActionParameterSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["string", "number", "boolean", "object", "array"]),
  required: z.boolean(),
  description: z.string().min(1),
}).strict();

const RuntimeActionCatalogItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string().min(1)),
  available: z.boolean(),
  toolName: AgentToolNameSchema.nullable(),
  inputFields: z.array(RuntimeActionParameterSchema),
}).strict();

const RuntimeRoutineCatalogItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string().min(1)),
  available: z.boolean(),
  actionIds: z.array(z.string().min(1)),
  inputFields: z.array(RuntimeActionParameterSchema),
}).strict();

export const RuntimeListActionsInputSchema = z.object({
  tag: z.string().min(1).optional(),
  availableOnly: z.boolean().optional(),
}).strict();

export const RuntimeListActionsResultSchema = z.object({
  generatedAt: z.number().int().nonnegative(),
  actions: z.array(RuntimeActionCatalogItemSchema),
}).strict();

export const RuntimeRunActionInputSchema = z.object({
  actionId: z.string().min(1),
  arguments: z.object({}).catchall(z.unknown()).optional(),
}).strict();

export const RuntimeRunActionResultSchema = z.object({
  actionId: z.string().min(1),
  title: z.string().min(1),
  ok: z.boolean(),
  summary: z.string().min(1),
  toolName: AgentToolNameSchema.nullable(),
  output: z.unknown().optional(),
  error: ToolExecutionErrorSchema.optional(),
}).strict();

export const RuntimeListRoutinesInputSchema = z.object({
  tag: z.string().min(1).optional(),
  availableOnly: z.boolean().optional(),
}).strict();

export const RuntimeListRoutinesResultSchema = z.object({
  generatedAt: z.number().int().nonnegative(),
  routines: z.array(RuntimeRoutineCatalogItemSchema),
}).strict();

const RuntimeRoutineStepResultSchema = z.object({
  actionId: z.string().min(1),
  title: z.string().min(1),
  ok: z.boolean(),
  summary: z.string().min(1),
  toolName: AgentToolNameSchema.nullable(),
  output: z.unknown().optional(),
  error: ToolExecutionErrorSchema.optional(),
}).strict();

export const RuntimeRunRoutineInputSchema = z.object({
  routineId: z.string().min(1),
  arguments: z.object({}).catchall(z.unknown()).optional(),
}).strict();

export const RuntimeRunRoutineResultSchema = z.object({
  routineId: z.string().min(1),
  title: z.string().min(1),
  ok: z.boolean(),
  summary: z.string().min(1),
  steps: z.array(RuntimeRoutineStepResultSchema),
}).strict();

export const ToolExecutionResultEnvelopeSchema = z.object({
  toolName: AgentToolNameSchema,
  ok: z.boolean(),
  content: z.string(),
  data: z.unknown().optional(),
  error: ToolExecutionErrorSchema.optional(),
}).strict();

export type ToolExecutionResultEnvelope = z.infer<typeof ToolExecutionResultEnvelopeSchema>;
