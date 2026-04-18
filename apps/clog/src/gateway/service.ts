import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  ActionExecutionRequest,
  ActionExecutionResult,
  AgentRuntimeSummary,
  RuntimeWakeupConfig,
  SurfaceNotionTodoResponse,
  PostHogEndpointDiffRequest,
  PostHogEndpointRunRequest,
  PostHogInsightQueryRequest,
  ShellCommandRequest,
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
  SurfaceShellCommandResponse,
  SurfaceThreadsResponse,
  SurfaceUpdatePreferencesRequest,
  SurfaceUpdatePreferencesResponse,
  SurfaceUpdateWakeupRequest,
  SurfaceUpdateWakeupResponse,
  UserPreferences,
} from "@clog/types";
import type { AgentEnvironment } from "../config";
import { normalizeRuntimeWakeupConfig } from "../brain/prompt-loader";
import { isValidIanaTimezone } from "../runtime/settings";
import type { NotionToolServices } from "../tools/types";
import type { PostHogIntegrationClient } from "../integrations/posthog/client";
import { BrainService } from "../brain/service";
import type { MonitoringLoop } from "../runtime/monitor-loop";
import type { MonitoringTickResult } from "../runtime/monitor-loop";
import { ShellExecutor } from "../execution/shell-executor";
import type { RuntimeStore } from "../storage/chat";
import type { AgentGatewaySurface } from "./contracts";
import type { PostHogToolServices } from "../tools/types";

export interface AgentGatewayDependencies {
  readonly env: AgentEnvironment;
  readonly bootedAt: number;
  readonly brain: BrainService;
  readonly monitorLoop: MonitoringLoop;
  readonly posthog: PostHogIntegrationClient;
  readonly posthogServices: Pick<
    PostHogToolServices,
    | "getOrganizations"
    | "getProjects"
    | "getDocumentedToolCatalog"
    | "listMcpTools"
    | "callMcpTool"
    | "runQuery"
    | "listErrors"
    | "listEndpoints"
    | "diffEndpoints"
    | "runEndpoint"
  >;
  readonly notionServices: Pick<NotionToolServices, "getTodoList">;
  readonly store: RuntimeStore;
}

const resolveWakeupConfigPath = (env: AgentEnvironment): string =>
  join(env.storage.readOnlyDir, "wakeup.json");

const resolveSettingsPath = (env: AgentEnvironment): string =>
  join(env.storage.readOnlyDir, "settings.json");

const readWakeupConfig = (env: AgentEnvironment): RuntimeWakeupConfig | null => {
  try {
    return normalizeRuntimeWakeupConfig(JSON.parse(readFileSync(resolveWakeupConfigPath(env), "utf-8")) as unknown);
  } catch {
    return null;
  }
};

interface SettingsJsonShape {
  readonly ui?: {
    readonly timezone?: string;
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

const readSettingsFile = (path: string): SettingsJsonShape => {
  try {
    const value = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as SettingsJsonShape;
    }
    return {};
  } catch {
    return {};
  }
};

const readPreferences = (env: AgentEnvironment): UserPreferences => {
  const settings = readSettingsFile(resolveSettingsPath(env));
  const timezone = typeof settings.ui?.timezone === "string" ? settings.ui.timezone.trim() : "";
  if (timezone && isValidIanaTimezone(timezone)) {
    return { timezone };
  }
  return env.preferences;
};

const writeJsonAtomically = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;

  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
    renameSync(temporaryPath, path);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
};

export interface RunWakeupPassInput {
  readonly message: string;
  readonly threadTitle?: string;
}

export interface RunWakeupPassResult {
  readonly monitorResult: MonitoringTickResult;
  readonly response: SurfaceSendMessageResponse;
}

export class AgentGateway implements AgentGatewaySurface {
  private serialQueue: Promise<void> = Promise.resolve();
  private readonly threadQueues = new Map<string, Promise<void>>();

  constructor(private readonly deps: AgentGatewayDependencies) {}

  runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.serialQueue.then(operation, operation);
    this.serialQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private runThreadExclusive<T>(threadId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.threadQueues.get(threadId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(operation);
    const queueEntry = run.then(() => undefined, () => undefined);
    this.threadQueues.set(threadId, queueEntry);

    return run.finally(() => {
      if (this.threadQueues.get(threadId) === queueEntry) {
        this.threadQueues.delete(threadId);
      }
    });
  }

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
      wakeup: readWakeupConfig(this.deps.env),
      preferences: readPreferences(this.deps.env),
    };
  }

  async runMonitorCycle() {
    return await this.runExclusive(async () => await this.deps.monitorLoop.tick());
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

    return await this.runThreadExclusive(thread.id, async () => {
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
    });
  }

  async runWakeupPass(input: RunWakeupPassInput): Promise<RunWakeupPassResult> {
    const thread = this.deps.store.seedOperatorThread("system", input.threadTitle?.trim() || "Scheduled Wakeups");

    return await this.runExclusive(async () => {
      const monitorResult = await this.deps.monitorLoop.tick();
      const response = await this.sendMessage({
        channel: "system",
        threadId: thread.id,
        message: input.message,
      });

      return {
        monitorResult,
        response,
      };
    });
  }

  async updateWakeupConfig(input: SurfaceUpdateWakeupRequest): Promise<SurfaceUpdateWakeupResponse> {
    const wakeup = normalizeRuntimeWakeupConfig(input);
    if (!wakeup) {
      throw new Error("Wakeup config requires named prompts, valid daily UTC schedule entries, and non-empty prompt text");
    }

    writeJsonAtomically(resolveWakeupConfigPath(this.deps.env), wakeup);
    return { wakeup };
  }

  async updatePreferences(input: SurfaceUpdatePreferencesRequest): Promise<SurfaceUpdatePreferencesResponse> {
    const timezone = typeof input.timezone === "string" ? input.timezone.trim() : "";
    if (!timezone || !isValidIanaTimezone(timezone)) {
      throw new Error("Invalid IANA timezone");
    }

    const settingsPath = resolveSettingsPath(this.deps.env);
    const current = readSettingsFile(settingsPath);
    const merged = {
      ...current,
      ui: {
        ...(current.ui ?? {}),
        timezone,
      },
    };

    writeJsonAtomically(settingsPath, merged);
    return {
      preferences: {
        timezone,
      },
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

  async listPostHogOrganizations(): Promise<SurfacePostHogOrganizationsResponse> {
    if (!this.deps.env.capabilities.posthog.canReadInsights) {
      throw new Error("PostHog insight reads are disabled in the current configuration");
    }

    return {
      organizations: await this.deps.posthogServices.getOrganizations(),
    };
  }

  async listPostHogProjects(organizationId?: string): Promise<SurfacePostHogProjectsResponse> {
    if (!this.deps.env.capabilities.posthog.canReadInsights) {
      throw new Error("PostHog insight reads are disabled in the current configuration");
    }

    return await this.deps.posthogServices.getProjects(organizationId);
  }

  async getPostHogDocumentedToolCatalog(input: {
    readonly feature?: string;
    readonly priority?: "core" | "high" | "extended";
    readonly includeExtended?: boolean;
  } = {}): Promise<SurfacePostHogDocumentedToolCatalogResponse> {
    if (!this.deps.env.capabilities.posthog.canReadInsights) {
      throw new Error("PostHog insight reads are disabled in the current configuration");
    }

    return await this.deps.posthogServices.getDocumentedToolCatalog(input);
  }

  async listPostHogErrors(): Promise<SurfacePostHogErrorsResponse> {
    if (!this.deps.env.capabilities.posthog.canReadErrors) {
      throw new Error("PostHog error reads are disabled in the current configuration");
    }

    return {
      observations: await this.deps.posthogServices.listErrors(),
    };
  }

  async listPostHogMcpTools(nameFilter?: string, includeInputSchema = false): Promise<SurfacePostHogMcpToolsResponse> {
    if (!this.deps.env.capabilities.posthog.canReadInsights) {
      throw new Error("PostHog insight reads are disabled in the current configuration");
    }

    return await this.deps.posthogServices.listMcpTools({
      nameFilter,
      includeInputSchema,
    });
  }

  async callPostHogMcpTool(toolName: string, args?: Record<string, unknown>): Promise<SurfacePostHogMcpToolCallResponse> {
    if (!this.deps.env.capabilities.posthog.canReadInsights) {
      throw new Error("PostHog insight reads are disabled in the current configuration");
    }

    const normalizedToolName = toolName.trim();
    if (!normalizedToolName) {
      throw new Error("PostHog MCP tool name cannot be empty");
    }

    return await this.deps.posthogServices.callMcpTool(normalizedToolName, args);
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
      result: await this.deps.posthogServices.runQuery(name, query),
    };
  }

  async listPostHogEndpoints(cwd?: string): Promise<SurfacePostHogEndpointListResponse> {
    if (!this.deps.env.capabilities.posthog.canManageEndpoints) {
      throw new Error("PostHog endpoint management is disabled in the current configuration");
    }

    return {
      result: this.deps.posthogServices.listEndpoints(cwd),
    };
  }

  async diffPostHogEndpoints(input: PostHogEndpointDiffRequest): Promise<SurfacePostHogEndpointDiffResponse> {
    if (!this.deps.env.capabilities.posthog.canManageEndpoints) {
      throw new Error("PostHog endpoint management is disabled in the current configuration");
    }

    return {
      result: this.deps.posthogServices.diffEndpoints(input.path, input.cwd),
    };
  }

  async runPostHogEndpoint(input: PostHogEndpointRunRequest): Promise<SurfacePostHogEndpointRunResponse> {
    if (!this.deps.env.capabilities.posthog.canManageEndpoints) {
      throw new Error("PostHog endpoint management is disabled in the current configuration");
    }

    return {
      result: this.deps.posthogServices.runEndpoint(input),
    };
  }

  async getNotionTodoList(input: {
    readonly includeDone?: boolean;
    readonly limit?: number;
    readonly progress?: readonly string[];
  }): Promise<SurfaceNotionTodoResponse> {
    if (!this.deps.env.capabilities.notion.canReadTodo) {
      throw new Error("Notion todo access is disabled in the current configuration");
    }

    return await this.deps.notionServices.getTodoList(input);
  }
}
