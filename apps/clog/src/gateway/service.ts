import type {
  ActionExecutionRequest,
  ActionExecutionResult,
  AgentRuntimeSummary,
  SurfaceAcknowledgeFindingRequest,
  SurfaceActionExecutionResponse,
  SurfaceBootstrapResponse,
  SurfaceFindingsResponse,
  SurfaceSendMessageRequest,
  SurfaceSendMessageResponse,
  SurfaceThreadsResponse,
} from "@clog/types";
import type { AgentEnvironment } from "../config/env";
import { RemediationPlanner } from "../agent/planner";
import type { MonitoringLoop } from "../agent/monitor-loop";
import { InMemoryRuntimeStore } from "../storage/in-memory-runtime-store";
import type { AgentGatewaySurface } from "./contracts";

export interface AgentGatewayDependencies {
  readonly env: AgentEnvironment;
  readonly bootedAt: number;
  readonly planner: RemediationPlanner;
  readonly monitorLoop: MonitoringLoop;
  readonly store: InMemoryRuntimeStore;
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
    this.deps.store.appendMessages(thread.id, [userMessage]);

    const findings = this.deps.store.listFindings();
    const plan = this.deps.planner.planForMessage(input.message, findings);
    const assistantMessage = this.deps.store.createMessage("assistant", input.channel, plan.summary);
    const updatedThread = this.deps.store.appendMessages(thread.id, [assistantMessage]);

    return {
      thread: updatedThread,
      assistantMessage,
      recommendedActions: plan.actions,
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

    if (finding && action.kind === "notify") {
      this.deps.planner.planForFinding(finding);
    }

    return { result };
  }
}
