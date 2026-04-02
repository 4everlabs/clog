import type {
  ActionExecutionRequest,
  SurfaceNotionTodoResponse,
  PostHogEndpointDiffRequest,
  PostHogEndpointRunRequest,
  PostHogInsightQueryRequest,
  SurfaceAcknowledgeFindingRequest,
  SurfaceActionExecutionResponse,
  SurfaceBootstrapResponse,
  SurfaceFindingsResponse,
  SurfacePostHogDocumentedToolCatalogResponse,
  SurfacePostHogEndpointDiffResponse,
  SurfacePostHogEndpointListResponse,
  SurfacePostHogEndpointRunResponse,
  SurfacePostHogErrorsResponse,
  SurfacePostHogInsightResponse,
  SurfacePostHogMcpToolCallResponse,
  SurfacePostHogMcpToolsResponse,
  SurfacePostHogOrganizationsResponse,
  SurfacePostHogProjectsResponse,
  SurfaceSendMessageRequest,
  SurfaceSendMessageResponse,
  SurfaceThreadsResponse,
  ShellCommandRequest,
  SurfaceShellCommandResponse,
} from "@clog/types";
import type { MonitoringTickResult } from "../monitoring/monitor-loop";

export interface AgentGatewaySurface {
  bootstrap(): Promise<SurfaceBootstrapResponse>;
  runMonitorCycle(): Promise<MonitoringTickResult>;
  listFindings(): Promise<SurfaceFindingsResponse>;
  listThreads(): Promise<SurfaceThreadsResponse>;
  sendMessage(input: SurfaceSendMessageRequest): Promise<SurfaceSendMessageResponse>;
  acknowledgeFinding(input: SurfaceAcknowledgeFindingRequest): Promise<SurfaceFindingsResponse>;
  executeAction(input: ActionExecutionRequest): Promise<SurfaceActionExecutionResponse>;
  runShellCommand(input: ShellCommandRequest): Promise<SurfaceShellCommandResponse>;
  listPostHogOrganizations(): Promise<SurfacePostHogOrganizationsResponse>;
  listPostHogProjects(organizationId?: string): Promise<SurfacePostHogProjectsResponse>;
  getPostHogDocumentedToolCatalog(input?: {
    readonly feature?: string;
    readonly priority?: "core" | "high" | "extended";
    readonly includeExtended?: boolean;
  }): Promise<SurfacePostHogDocumentedToolCatalogResponse>;
  listPostHogErrors(): Promise<SurfacePostHogErrorsResponse>;
  listPostHogMcpTools(nameFilter?: string, includeInputSchema?: boolean): Promise<SurfacePostHogMcpToolsResponse>;
  callPostHogMcpTool(toolName: string, args?: Record<string, unknown>): Promise<SurfacePostHogMcpToolCallResponse>;
  queryPostHogInsight(input: PostHogInsightQueryRequest): Promise<SurfacePostHogInsightResponse>;
  listPostHogEndpoints(cwd?: string): Promise<SurfacePostHogEndpointListResponse>;
  diffPostHogEndpoints(input: PostHogEndpointDiffRequest): Promise<SurfacePostHogEndpointDiffResponse>;
  runPostHogEndpoint(input: PostHogEndpointRunRequest): Promise<SurfacePostHogEndpointRunResponse>;
  getNotionTodoList(input: {
    readonly includeDone?: boolean;
    readonly limit?: number;
    readonly progress?: readonly string[];
  }): Promise<SurfaceNotionTodoResponse>;
}
