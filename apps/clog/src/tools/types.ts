import type {
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
import type { AgentToolName, ToolExecutionResultEnvelope, ToolFamily, ToolSummary } from "../schema/tools";

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
  readKnowledge(input?: {
    readonly path?: string;
    readonly maxChars?: number;
  }): {
    readonly availablePaths: readonly string[];
    readonly selectedPath: string | null;
    readonly content: string | null;
    readonly truncated: boolean;
  };
}

export interface ToolExecutionServices {
  readonly posthog: PostHogToolServices | null;
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
