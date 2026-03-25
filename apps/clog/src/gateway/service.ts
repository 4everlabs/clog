import type {
  ActionExecutionRequest,
  ActionExecutionResult,
  AgentRuntimeSummary,
  PostHogEndpointDiffRequest,
  PostHogEndpointRunRequest,
  PostHogInsightQueryRequest,
  ShellCommandRequest,
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
  SurfaceShellCommandResponse,
  SurfaceThreadsResponse,
} from "@clog/types";
import type { AgentEnvironment } from "../config";
import type { PostHogIntegrationClient } from "../integrations/posthog/client";
import { BrainService } from "../brain/service";
import { PostHogApiClient } from "../integrations/posthog/api-client";
import { PostHogCliTool } from "../integrations/posthog/cli-tool";
import type { MonitoringLoop } from "../monitoring/monitor-loop";
import { ShellExecutor } from "../execution/shell-executor";
import type { RuntimeStore } from "../storage/chat";
import type { AgentGatewaySurface } from "./contracts";

export interface AgentGatewayDependencies {
  readonly env: AgentEnvironment;
  readonly bootedAt: number;
  readonly brain: BrainService;
  readonly monitorLoop: MonitoringLoop;
  readonly posthog: PostHogIntegrationClient;
  readonly posthogApi: PostHogApiClient;
  readonly posthogCli: PostHogCliTool;
  readonly store: RuntimeStore;
}

export class AgentGateway implements AgentGatewaySurface {
  constructor(private readonly deps: AgentGatewayDependencies) {}

  async bootstrap(): Promise<SurfaceBootstrapResponse> {
    const tick = await this.deps.monitorLoop.tick();
    const runtime: AgentRuntimeSummary = {
      name: this.deps.env.appName,
      status: this.deps.store.getStatus(),
      executionMode: this.deps.env.executionMode,
      monitorIntervalMs: this.deps.env.monitorIntervalMs,
      bootedAt: this.deps.bootedAt,
      activeIntegrations: tick.integrationHealth.map((integration) => integration.kind),
    };

    return {
      runtime,
      capabilities: this.deps.env.capabilities,
      integrations: tick.integrationHealth,
      channels: this.deps.env.channels,
      openFindings: this.deps.store.listFindings().filter((finding) => finding.state === "open").length,
      threads: this.deps.store.listThreads().map((thread) => ({
        id: thread.id,
        title: thread.title,
        channel: thread.channel,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      })),
    };
  }

  async runMonitorCycle() {
    return await this.deps.monitorLoop.tick();
  }

  async listFindings(): Promise<SurfaceFindingsResponse> {
    return {
      findings: this.deps.store.listFindings(),
    };
  }

  async listThreads(): Promise<SurfaceThreadsResponse> {
    return {
      threads: this.deps.store.listThreads(),
    };
  }

  async sendMessage(input: SurfaceSendMessageRequest): Promise<SurfaceSendMessageResponse> {
    const thread = input.threadId
      ? this.deps.store.getThread(input.threadId)
      : this.deps.store.createThread(input.channel, input.title?.trim() || "Operator Conversation");

    if (!thread) {
      throw new Error(`Thread not found: ${input.threadId}`);
    }

    const userMessage = this.deps.store.createMessage("user", input.channel, input.message);
    const threadWithUserMessage = this.deps.store.appendMessages(thread.id, [userMessage]);

    const findings = this.deps.store.listFindings();
    const replyText = await this.deps.brain.reply({
      thread: threadWithUserMessage,
      message: input.message,
      findings,
    });
    const replyMessage = this.deps.store.createMessage("agent", input.channel, replyText);
    const updatedThread = this.deps.store.appendMessages(thread.id, [replyMessage]);
    const recommendedActions = findings.filter((finding) => finding.state === "open")[0]?.proposedActions ?? [];

    return {
      thread: updatedThread,
      replyMessage,
      recommendedActions,
    };
  }

  async acknowledgeFinding(input: SurfaceAcknowledgeFindingRequest): Promise<SurfaceFindingsResponse> {
    const finding = this.deps.store.acknowledgeFinding(input.findingId);
    if (!finding) {
      throw new Error(`Finding not found: ${input.findingId}`);
    }
    return this.listFindings();
  }

  async executeAction(input: ActionExecutionRequest): Promise<SurfaceActionExecutionResponse> {
    const finding = input.findingId ? this.deps.store.listFindings().find((entry) => entry.id === input.findingId) : null;
    const action = this.deps.store.listActions().find((entry) => entry.id === input.actionId);

    if (!action) {
      throw new Error(`Action not found: ${input.actionId}`);
    }

    const result: ActionExecutionResult = {
      actionId: action.id,
      state: action.approvalRequired ? "requires-approval" : "completed",
      summary: action.approvalRequired
        ? `Action "${action.title}" is intentionally gated behind approval before any GitHub or Vercel side effects happen.`
        : `Action "${action.title}" completed in placeholder mode.`,
    };

    this.deps.store.rememberActionResult(result);

    return { result };
  }

  async runShellCommand(input: ShellCommandRequest): Promise<SurfaceShellCommandResponse> {
    if (!this.deps.env.capabilities.shell.canExecute) {
      throw new Error("Shell execution is disabled in the current configuration");
    }
    const result = ShellExecutor.execute(input, this.deps.env.capabilities.shell.safeRoots);
    return { result };
  }

  async listPostHogErrors(): Promise<SurfacePostHogErrorsResponse> {
    if (!this.deps.env.capabilities.posthog.canReadErrors) {
      throw new Error("PostHog error reads are disabled in the current configuration");
    }

    return {
      observations: await this.deps.posthog.listErrorObservations(),
    };
  }

  async queryPostHogInsight(input: PostHogInsightQueryRequest): Promise<SurfacePostHogInsightResponse> {
    if (!this.deps.env.capabilities.posthog.canReadInsights) {
      throw new Error("PostHog insight reads are disabled in the current configuration");
    }

    const name = input.name.trim() || "PostHog insight query";
    const query = input.query.trim();
    if (!query) {
      throw new Error("PostHog insight query cannot be empty");
    }

    return {
      result: await this.deps.posthogApi.runInsightQuery(name, query),
    };
  }

  async diffPostHogEndpoints(input: PostHogEndpointDiffRequest): Promise<SurfacePostHogEndpointDiffResponse> {
    if (!this.deps.env.capabilities.posthog.canManageEndpoints) {
      throw new Error("PostHog endpoint management is disabled in the current configuration");
    }

    return {
      result: this.deps.posthogCli.diffEndpoints(input.path, input.cwd),
    };
  }

  async runPostHogEndpoint(input: PostHogEndpointRunRequest): Promise<SurfacePostHogEndpointRunResponse> {
    if (!this.deps.env.capabilities.posthog.canManageEndpoints) {
      throw new Error("PostHog endpoint management is disabled in the current configuration");
    }

    return {
      result: this.deps.posthogCli.runEndpoint(input),
    };
  }
}
