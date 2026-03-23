import type {
  ActionExecutionRequest,
  SurfaceAcknowledgeFindingRequest,
  SurfaceActionExecutionResponse,
  SurfaceBootstrapResponse,
  SurfaceFindingsResponse,
  SurfaceSendMessageRequest,
  SurfaceSendMessageResponse,
  SurfaceThreadsResponse,
} from "@clog/types";

export interface AgentGatewaySurface {
  bootstrap(): Promise<SurfaceBootstrapResponse>;
  listFindings(): Promise<SurfaceFindingsResponse>;
  listThreads(): Promise<SurfaceThreadsResponse>;
  sendMessage(input: SurfaceSendMessageRequest): Promise<SurfaceSendMessageResponse>;
  acknowledgeFinding(input: SurfaceAcknowledgeFindingRequest): Promise<SurfaceFindingsResponse>;
  executeAction(input: ActionExecutionRequest): Promise<SurfaceActionExecutionResponse>;
}
