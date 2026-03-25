export type AgentExecutionMode = "observe" | "propose" | "execute";

export type AgentStatus = "booting" | "idle" | "monitoring" | "degraded";

export type IntegrationKind = "posthog" | "github" | "vercel" | "chat";

export type IntegrationStatus = "ready" | "degraded" | "missing-config";

export type SurfaceChannelKind = "web" | "telegram" | "cli" | "system";

export type FindingSeverity = "info" | "warning" | "critical";

export type FindingState = "open" | "acknowledged" | "resolved";

export type ObservationKind =
  | "runtime-health"
  | "posthog-anomaly"
  | "error-rate-spike"
  | "insight-regression"
  | "repo-risk"
  | "deploy-risk"
  | "manual-note";

export type ActionExecutionState = "pending" | "requires-approval" | "running" | "completed" | "failed";

export type ActionKind = "notify" | "open-pr" | "deploy" | "runbook";

export interface IntegrationCapabilitySnapshot {
  readonly posthog: {
    readonly canReadInsights: boolean;
    readonly canReadErrors: boolean;
    readonly canReadLogs: boolean;
    readonly canReadFlags: boolean;
    readonly canReadExperiments: boolean;
    readonly canManageEndpoints: boolean;
    readonly canUploadSourcemaps: boolean;
  };
  readonly github: {
    readonly canReadRepository: boolean;
    readonly canCreatePullRequest: boolean;
    readonly canPushBranch: boolean;
  };
  readonly vercel: {
    readonly canTriggerDeploy: boolean;
  };
  readonly chat: {
    readonly canSendOperatorMessages: boolean;
    readonly supportedChannels: readonly SurfaceChannelKind[];
  };
  readonly shell: {
    readonly canExecute: boolean;
    readonly safeCommands: readonly string[];
    readonly safeRoots: readonly string[];
  };
}

export interface IntegrationHealthView {
  readonly kind: IntegrationKind;
  readonly status: IntegrationStatus;
  readonly summary: string;
  readonly lastCheckedAt: number | null;
}

export interface ObservationSource {
  readonly kind: IntegrationKind | "runtime";
  readonly label: string;
  readonly referenceId?: string;
  readonly url?: string;
}

export interface RuntimeObservation {
  readonly id: string;
  readonly kind: ObservationKind;
  readonly source: ObservationSource;
  readonly summary: string;
  readonly details: string;
  readonly severity: FindingSeverity;
  readonly detectedAt: number;
  readonly metadata?: Record<string, unknown>;
}

export interface ProposedAction {
  readonly id: string;
  readonly kind: ActionKind;
  readonly title: string;
  readonly summary: string;
  readonly approvalRequired: boolean;
  readonly target?: {
    readonly integration: IntegrationKind;
    readonly reference: string;
  };
}

export interface AgentFinding {
  readonly id: string;
  readonly title: string;
  readonly severity: FindingSeverity;
  readonly state: FindingState;
  readonly summary: string;
  readonly details: string;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
  readonly sources: readonly ObservationSource[];
  readonly observations: readonly RuntimeObservation[];
  readonly proposedActions: readonly ProposedAction[];
}

export interface ConversationMessage {
  readonly id: string;
  readonly role: "system" | "user" | "assistant";
  readonly channel: SurfaceChannelKind;
  readonly content: string;
  readonly createdAt: number;
}

export interface ConversationThread {
  readonly id: string;
  readonly title: string;
  readonly channel: SurfaceChannelKind;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messages: readonly ConversationMessage[];
}

export interface AgentRuntimeSummary {
  readonly name: string;
  readonly status: AgentStatus;
  readonly executionMode: AgentExecutionMode;
  readonly monitorIntervalMs: number;
  readonly bootedAt: number;
  readonly activeIntegrations: readonly IntegrationKind[];
}

export interface SurfaceBootstrapResponse {
  readonly runtime: AgentRuntimeSummary;
  readonly capabilities: IntegrationCapabilitySnapshot;
  readonly integrations: readonly IntegrationHealthView[];
  readonly channels: readonly SurfaceChannelKind[];
  readonly openFindings: number;
  readonly threads: readonly Pick<ConversationThread, "id" | "title" | "channel" | "createdAt" | "updatedAt">[];
}

export interface SurfaceFindingsResponse {
  readonly findings: readonly AgentFinding[];
}

export interface SurfaceThreadsResponse {
  readonly threads: readonly ConversationThread[];
}

export interface SurfaceSendMessageRequest {
  readonly threadId?: string;
  readonly channel: SurfaceChannelKind;
  readonly title?: string;
  readonly message: string;
}

export interface SurfaceSendMessageResponse {
  readonly thread: ConversationThread;
  readonly assistantMessage: ConversationMessage;
  readonly recommendedActions: readonly ProposedAction[];
}

export interface SurfaceAcknowledgeFindingRequest {
  readonly findingId: string;
}

export interface SurfaceAcknowledgeFindingResponse {
  readonly finding: AgentFinding;
}

export interface ActionExecutionRequest {
  readonly findingId?: string;
  readonly actionId: string;
}

export interface ActionExecutionResult {
  readonly actionId: string;
  readonly state: ActionExecutionState;
  readonly summary: string;
}

export interface SurfaceActionExecutionResponse {
  readonly result: ActionExecutionResult;
}

export interface PostHogInsightQueryRequest {
  readonly name: string;
  readonly query: string;
}

export interface PostHogInsightQueryResult {
  readonly name: string;
  readonly columns: readonly string[];
  readonly results: readonly Record<string, unknown>[];
}

export interface SurfacePostHogInsightResponse {
  readonly result: PostHogInsightQueryResult;
}

export interface SurfacePostHogErrorsResponse {
  readonly observations: readonly RuntimeObservation[];
}

export interface PostHogEndpointDiffRequest {
  readonly path: string;
  readonly cwd?: string;
}

export interface PostHogEndpointRunRequest {
  readonly endpointName?: string;
  readonly filePath?: string;
  readonly cwd?: string;
  readonly variables?: Record<string, string>;
  readonly json?: boolean;
}

export interface PostHogCliCommandResponse {
  readonly ok: boolean;
  readonly command: string;
  readonly args: readonly string[];
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly workingDirectory: string;
  readonly parsedJson?: unknown;
}

export interface SurfacePostHogEndpointDiffResponse {
  readonly result: PostHogCliCommandResponse;
}

export interface SurfacePostHogEndpointRunResponse {
  readonly result: PostHogCliCommandResponse;
}

export interface ShellCommandRequest {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Record<string, string>;
}

export interface ShellCommandResponse {
  readonly ok: boolean;
  readonly command: string;
  readonly args: readonly string[];
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly workingDirectory: string;
}

export interface SurfaceShellCommandResponse {
  readonly result: ShellCommandResponse;
}
