import type {
  ConversationMessage,
  ConversationThread,
  ConvexQueryRequest,
  SurfaceConvexQueryResponse,
  IntegrationCapabilitySnapshot,
  SurfaceNotionTodoResponse,
  PostHogCliCommandResponse,
  PostHogEndpointRunRequest,
  PostHogInsightQueryResult,
  PostHogOrganizationSummary,
  PostHogProjectSummary,
  RuntimeObservation,
  ShellCommandRequest,
  ShellCommandResponse,
} from "@clog/types";
import type { z, ZodTypeAny } from "zod";
import type { PostHogDashboardSnapshot } from "../integrations/posthog/dashboard-snapshot";
import type { PostHogDocumentedToolCatalog } from "../integrations/posthog/documented-tool-catalog";
import type {
  AgentToolName,
  ToolCapabilityGroup,
  ToolExecutionResultEnvelope,
  ToolExposureTier,
  ToolFamily,
  ToolSummary,
} from "../schema/tools";

type RuntimeMonitoringReport = {
  readonly fileName: string;
  readonly createdAt: number;
  readonly report: Record<string, unknown>;
};

type RuntimeMonitoringOperation = {
  readonly operation: string;
  readonly lastRecordedAt: number;
  readonly history: ReadonlyArray<{
    readonly recordedAt: number;
    readonly data: unknown;
  }>;
};

type RuntimeConversationThreadView = Pick<
  ConversationThread,
  "id" | "title" | "channel" | "createdAt" | "updatedAt"
>;

type RuntimeConversationMessageView = Pick<
  ConversationMessage,
  "id" | "role" | "channel" | "content" | "createdAt"
>;

export interface PostHogToolServices {
  getOrganizations(): Promise<readonly PostHogOrganizationSummary[]>;
  getProjects(organizationId?: string): Promise<{
    readonly organizationId: string;
    readonly projects: readonly PostHogProjectSummary[];
  }>;
  runQuery(name: string, query: string, refresh?: string): Promise<PostHogInsightQueryResult>;
  listErrors(): Promise<readonly RuntimeObservation[]>;
  listMcpTools(input: {
    readonly nameFilter?: string;
    readonly includeInputSchema?: boolean;
    readonly limit?: number;
  }): Promise<{
    readonly total: number;
    readonly returned: number;
    readonly tools: ReadonlyArray<{
      readonly name: string;
      readonly title?: string | null;
      readonly description?: string | null;
      readonly inputSchema?: unknown;
    }>;
  }>;
  callMcpTool(toolName: string, args?: Record<string, unknown>): Promise<{
    readonly toolName: string;
    readonly text: string;
    readonly structuredContent?: unknown;
  }>;
  getDashboardSnapshot(input?: {
    readonly windowMinutes?: number;
    readonly topPathsLimit?: number;
  }): Promise<PostHogDashboardSnapshot>;
  getDocumentedToolCatalog(input?: {
    readonly feature?: string;
    readonly priority?: "core" | "high" | "extended";
    readonly includeExtended?: boolean;
  }): Promise<PostHogDocumentedToolCatalog> | PostHogDocumentedToolCatalog;
  queryInsight(name: string, query: string): Promise<PostHogInsightQueryResult>;
  listEndpoints(cwd?: string): PostHogCliCommandResponse;
  diffEndpoints(path: string, cwd?: string): PostHogCliCommandResponse;
  runEndpoint(input: PostHogEndpointRunRequest): PostHogCliCommandResponse;
}

export interface ShellToolServices {
  readonly safeRoots: readonly string[];
  execute(input: ShellCommandRequest): ShellCommandResponse;
}

export interface NotionToolServices {
  getTodoList(input: {
    readonly includeDone?: boolean;
    readonly limit?: number;
    readonly progress?: readonly string[];
  }): Promise<SurfaceNotionTodoResponse>;
}

export interface ConvexToolServices {
  runQuery(input: ConvexQueryRequest): Promise<SurfaceConvexQueryResponse>;
}

export interface RuntimeToolServices {
  getStateSnapshot(input?: {
    readonly threadLimit?: number;
    readonly messageLimitPerThread?: number;
    readonly findingLimit?: number;
    readonly memoryLimit?: number;
    readonly actionResultLimit?: number;
  }): {
    readonly generatedAt: number;
    readonly status: string;
    readonly openFindingsCount: number;
    readonly openFindings: readonly unknown[];
    readonly recentThreads: readonly unknown[];
    readonly recentMemories: readonly unknown[];
    readonly recentActionResults: readonly unknown[];
  };
  getRecentLogs(input?: {
    readonly fileLimit?: number;
    readonly lineLimit?: number;
    readonly pathContains?: string;
  }): {
    readonly generatedAt: number;
    readonly files: readonly unknown[];
  };
  getMonitoringSnapshot(input?: {
    readonly reportLimit?: number;
    readonly operationHistoryLimit?: number;
  }): {
    readonly generatedAt: number;
    readonly latestPerformanceReport: Record<string, unknown> | null;
    readonly recentPerformanceReports: readonly RuntimeMonitoringReport[];
    readonly recentPostHogOperations: readonly RuntimeMonitoringOperation[];
  };
  listActions(input?: {
    readonly tag?: string;
    readonly availableOnly?: boolean;
  }): {
    readonly generatedAt: number;
    readonly actions: readonly unknown[];
  };
  runAction(input: {
    readonly actionId: string;
    readonly arguments?: Record<string, unknown>;
  }): Promise<{
    readonly actionId: string;
    readonly title: string;
    readonly ok: boolean;
    readonly summary: string;
    readonly toolName: AgentToolName | null;
    readonly output?: unknown;
    readonly error?: {
      readonly code: string;
      readonly message: string;
    };
  }>;
  listRoutines(input?: {
    readonly tag?: string;
    readonly availableOnly?: boolean;
  }): {
    readonly generatedAt: number;
    readonly routines: readonly unknown[];
  };
  runRoutine(input: {
    readonly routineId: string;
    readonly arguments?: Record<string, unknown>;
  }): Promise<{
    readonly routineId: string;
    readonly title: string;
    readonly ok: boolean;
    readonly summary: string;
    readonly steps: readonly unknown[];
  }>;
  readKnowledge(input?: {
    readonly path?: string;
    readonly maxChars?: number;
  }): {
    readonly availablePaths: readonly string[];
    readonly selectedPath: string | null;
    readonly content: string | null;
    readonly truncated: boolean;
  };
  readJson(input: {
    readonly path: string;
    readonly fieldPath?: string;
    readonly maxChars?: number;
  }): {
    readonly path: string;
    readonly fieldPath: string | null;
    readonly valueType: "object" | "array" | "string" | "number" | "boolean" | "null";
    readonly childKeys: readonly string[];
    readonly childCount: number | null;
    readonly value?: unknown;
    readonly preview?: string;
    readonly truncated: boolean;
  };
  listConversations(input?: {
    readonly limit?: number;
    readonly channel?: "web" | "telegram" | "tui" | "system";
    readonly titleContains?: string;
    readonly timePreset?: "last_hour" | "last_12_hours" | "last_24_hours";
    readonly windowMinutes?: number;
  }): {
    readonly generatedAt: number;
    readonly conversations: readonly unknown[];
  };
  getConversation(input: {
    readonly threadId: string;
    readonly messageOffset?: number;
    readonly messageLimit?: number;
    readonly tokenBudget?: number;
    readonly timePreset?: "last_hour" | "last_12_hours" | "last_24_hours";
    readonly windowMinutes?: number;
  }): {
    readonly generatedAt: number;
    readonly thread: RuntimeConversationThreadView;
    readonly messages: readonly RuntimeConversationMessageView[];
    readonly totalMessages: number;
    readonly messageOffset: number;
    readonly messageLimit: number;
    readonly tokenBudget: number;
    readonly returnedTokenEstimate: number;
    readonly hasMoreMessages: boolean;
    readonly nextMessageOffset: number | null;
    readonly remainingMessages: number;
    readonly nextRequest: {
      readonly toolName: "runtime_get_conversation";
      readonly arguments: {
        readonly threadId: string;
        readonly messageOffset: number;
        readonly tokenBudget: number;
        readonly timePreset?: "last_hour" | "last_12_hours" | "last_24_hours";
        readonly windowMinutes?: number;
      };
    } | null;
    readonly continuationHint: string | null;
  };
  searchMessages(input: {
    readonly query: string;
    readonly threadId?: string;
    readonly channel?: "web" | "telegram" | "tui" | "system";
    readonly limit?: number;
    readonly caseSensitive?: boolean;
    readonly timePreset?: "last_hour" | "last_12_hours" | "last_24_hours";
    readonly windowMinutes?: number;
  }): {
    readonly generatedAt: number;
    readonly matches: readonly unknown[];
    readonly truncated: boolean;
  };
}

export interface ToolExecutionServices {
  readonly posthog: PostHogToolServices | null;
  readonly convex?: ConvexToolServices | null;
  readonly notion: NotionToolServices | null;
  readonly runtime: RuntimeToolServices | null;
  readonly shell: ShellToolServices | null;
  readonly github: null;
  readonly vercel: null;
}

export interface ToolExecutionContext {
  readonly capabilities: IntegrationCapabilitySnapshot;
  readonly services: ToolExecutionServices;
}

export interface RegisteredTool<TInputSchema extends ZodTypeAny = ZodTypeAny, TOutputSchema extends ZodTypeAny = ZodTypeAny> {
  readonly name: AgentToolName;
  readonly title: string;
  readonly description: string;
  readonly integration: ToolFamily;
  readonly exposureTier: ToolExposureTier;
  readonly capabilityGroup: ToolCapabilityGroup;
  readonly approvalRequired: boolean;
  readonly implemented: boolean;
  readonly inputSchema: TInputSchema;
  readonly outputSchema: TOutputSchema;
  isEnabled(capabilities: IntegrationCapabilitySnapshot): boolean;
  execute?(services: ToolExecutionServices, input: z.infer<TInputSchema>): Promise<z.infer<TOutputSchema>> | z.infer<TOutputSchema>;
}

export type AnyRegisteredTool = RegisteredTool<ZodTypeAny, ZodTypeAny>;

export interface ExecutedToolCall extends ToolExecutionResultEnvelope {
  readonly tool: ToolSummary;
}
