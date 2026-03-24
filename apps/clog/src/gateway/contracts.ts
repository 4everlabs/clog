import type {
  ActionExecutionRequest,
  PostHogEndpointDiffRequest,
  PostHogEndpointRunRequest,
  PostHogInsightQueryRequest,
  SurfaceAcknowledgeFindingRequest,
  SurfaceActionExecutionResponse,
  SurfaceBootstrapResponse,
  SurfaceFindingsResponse,
  SurfacePostHogEndpointDiffResponse,
  SurfacePostHogEndpointRunResponse,
  SurfacePostHogErrorsResponse,
  SurfacePostHogInsightResponse,
  SurfaceSendMessageRequest,
  SurfaceSendMessageResponse,
  SurfaceThreadsResponse,
  ShellCommandRequest,
  SurfaceShellCommandResponse,
} from "@clog/types";

export interface AgentGatewaySurface {
  bootstrap(): Promise<SurfaceBootstrapResponse>;
  listFindings(): Promise<SurfaceFindingsResponse>;
  listThreads(): Promise<SurfaceThreadsResponse>;
  sendMessage(input: SurfaceSendMessageRequest): Promise<SurfaceSendMessageResponse>;
  acknowledgeFinding(input: SurfaceAcknowledgeFindingRequest): Promise<SurfaceFindingsResponse>;
  executeAction(input: ActionExecutionRequest): Promise<SurfaceActionExecutionResponse>;
  runShellCommand(input: ShellCommandRequest): Promise<SurfaceShellCommandResponse>;
  listPostHogErrors(): Promise<SurfacePostHogErrorsResponse>;
  queryPostHogInsight(input: PostHogInsightQueryRequest): Promise<SurfacePostHogInsightResponse>;
  diffPostHogEndpoints(input: PostHogEndpointDiffRequest): Promise<SurfacePostHogEndpointDiffResponse>;
  runPostHogEndpoint(input: PostHogEndpointRunRequest): Promise<SurfacePostHogEndpointRunResponse>;
}
