import type {
  IntegrationCapabilitySnapshot,
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
  queryInsight(name: string, query: string): Promise<PostHogInsightQueryResult>;
  diffEndpoints(path: string, cwd?: string): PostHogCliCommandResponse;
  runEndpoint(input: PostHogEndpointRunRequest): PostHogCliCommandResponse;
}

export interface ShellToolServices {
  readonly safeRoots: readonly string[];
  execute(input: ShellCommandRequest): ShellCommandResponse;
}

export interface ToolExecutionServices {
  readonly posthog: PostHogToolServices | null;
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
