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
  "posthog_list_mcp_tools",
  "posthog_call_mcp_tool",
  "posthog_list_endpoints",
  "posthog_diff_endpoints",
  "posthog_run_endpoint",
  "notion_get_todo_list",
  "runtime_get_state_snapshot",
  "runtime_get_recent_logs",
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
  channel: z.enum(["web", "telegram", "cli", "system"]),
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

export const ToolExecutionResultEnvelopeSchema = z.object({
  toolName: AgentToolNameSchema,
  ok: z.boolean(),
  content: z.string(),
  data: z.unknown().optional(),
  error: ToolExecutionErrorSchema.optional(),
}).strict();

export type ToolExecutionResultEnvelope = z.infer<typeof ToolExecutionResultEnvelopeSchema>;
