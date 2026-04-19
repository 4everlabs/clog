import type { IntegrationCapabilitySnapshot } from "@clog/types";
import { getRegisteredTool } from "../ai/tools/registry";
import type { ExecutedToolCall } from "../ai/tools/types";
import type { AgentToolName } from "../ai/tools/schema/tools";

type JsonObject = Record<string, unknown>;

interface RuntimeActionField {
  readonly name: string;
  readonly type: "string" | "number" | "boolean" | "object" | "array";
  readonly required: boolean;
  readonly description: string;
}

interface RuntimeActionRunResult {
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
}

interface RuntimeRoutineRunResult {
  readonly routineId: string;
  readonly title: string;
  readonly ok: boolean;
  readonly summary: string;
  readonly steps: readonly RuntimeActionRunResult[];
}

interface ActionDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly toolName: AgentToolName;
  readonly inputFields: readonly RuntimeActionField[];
  readonly buildArgs: (input: JsonObject) => JsonObject;
}

interface RoutineStep {
  readonly actionId: string;
  readonly arguments?: JsonObject;
}

interface RoutineDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly inputFields: readonly RuntimeActionField[];
  readonly actionIds: readonly string[];
  readonly buildSteps: (input: JsonObject) => readonly RoutineStep[];
}

export interface RuntimeOrchestrationServiceConfig {
  readonly capabilities: IntegrationCapabilitySnapshot;
  readonly executeTool: (toolName: AgentToolName, args: unknown) => Promise<ExecutedToolCall>;
}

const toRecord = (value: unknown): JsonObject => {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
};

const toTrimmedString = (value: unknown): string | null => {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

const optionalString = (input: JsonObject, key: string): string | undefined => {
  return toTrimmedString(input[key]) ?? undefined;
};

const optionalNumber = (input: JsonObject, key: string): number | undefined => {
  const value = input[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const hasTruthyStringInput = (input: JsonObject, key: string): boolean => Boolean(optionalString(input, key));

const createToolAction = (definition: ActionDefinition): ActionDefinition => definition;

const actionDefinitions: readonly ActionDefinition[] = [
  createToolAction({
    id: "posthog.dashboard_snapshot",
    title: "PostHog Dashboard Snapshot",
    description: "Get the high-signal product and performance snapshot.",
    summary: "Best first look when you want current health without digging through multiple surfaces.",
    tags: ["posthog", "health", "monitoring"],
    toolName: "posthog_get_dashboard_snapshot",
    inputFields: [
      { name: "windowMinutes", type: "number", required: false, description: "How large the recent time window should be." },
      { name: "topPathsLimit", type: "number", required: false, description: "How many top paths to include." },
    ],
    buildArgs: (input) => ({
      windowMinutes: optionalNumber(input, "windowMinutes"),
      topPathsLimit: optionalNumber(input, "topPathsLimit"),
    }),
  }),
  createToolAction({
    id: "posthog.list_errors",
    title: "PostHog List Errors",
    description: "List active PostHog error issues.",
    summary: "Use this when you need current error pressure and active issues.",
    tags: ["posthog", "errors", "incident"],
    toolName: "posthog_list_errors",
    inputFields: [],
    buildArgs: () => ({}),
  }),
  createToolAction({
    id: "posthog.query_logs",
    title: "PostHog Query Logs",
    description: "Query logs with a focused filter slice.",
    summary: "Useful when you already have a likely service, error string, or time range.",
    tags: ["posthog", "logs", "incident"],
    toolName: "posthog_query_logs",
    inputFields: [
      { name: "query", type: "string", required: false, description: "Free text query." },
      { name: "service", type: "string", required: false, description: "Service name filter." },
      { name: "level", type: "string", required: false, description: "Log level filter." },
      { name: "from", type: "string", required: false, description: "Start timestamp or relative expression." },
      { name: "to", type: "string", required: false, description: "End timestamp or relative expression." },
      { name: "limit", type: "number", required: false, description: "Max log entries to return." },
    ],
    buildArgs: (input) => ({
      query: optionalString(input, "query"),
      service: optionalString(input, "service"),
      level: optionalString(input, "level"),
      from: optionalString(input, "from"),
      to: optionalString(input, "to"),
      limit: optionalNumber(input, "limit"),
    }),
  }),
  createToolAction({
    id: "posthog.get_feature_flag",
    title: "PostHog Get Feature Flag",
    description: "Get a feature flag definition.",
    summary: "Use when you need rollout metadata for a single flag.",
    tags: ["posthog", "flags", "release"],
    toolName: "posthog_get_feature_flag",
    inputFields: [
      { name: "flagId", type: "string", required: true, description: "Feature flag id or key accepted by the target tool." },
    ],
    buildArgs: (input) => ({
      id: optionalString(input, "flagId"),
    }),
  }),
  createToolAction({
    id: "posthog.flag_status",
    title: "PostHog Feature Flag Status",
    description: "Inspect status and enablement for a feature flag.",
    summary: "Use when rollout state matters more than full definition details.",
    tags: ["posthog", "flags", "release"],
    toolName: "posthog_get_feature_flag_status",
    inputFields: [
      { name: "flagId", type: "string", required: true, description: "Feature flag id or key accepted by the target tool." },
    ],
    buildArgs: (input) => ({
      id: optionalString(input, "flagId"),
    }),
  }),
  createToolAction({
    id: "posthog.flag_blast_radius",
    title: "PostHog Feature Flag Blast Radius",
    description: "Estimate affected users for a flag rollout.",
    summary: "Use when you need a fast answer to how risky a flag is right now.",
    tags: ["posthog", "flags", "release"],
    toolName: "posthog_get_feature_flag_blast_radius",
    inputFields: [
      { name: "flagId", type: "string", required: true, description: "Feature flag id or key accepted by the target tool." },
    ],
    buildArgs: (input) => ({
      id: optionalString(input, "flagId"),
    }),
  }),
  createToolAction({
    id: "posthog.get_experiment",
    title: "PostHog Get Experiment",
    description: "Get experiment metadata.",
    summary: "Use when you need current experiment setup and lifecycle state.",
    tags: ["posthog", "experiments", "analysis"],
    toolName: "posthog_get_experiment",
    inputFields: [
      { name: "experimentId", type: "string", required: true, description: "Experiment id." },
    ],
    buildArgs: (input) => ({
      id: optionalString(input, "experimentId"),
    }),
  }),
  createToolAction({
    id: "posthog.get_experiment_results",
    title: "PostHog Get Experiment Results",
    description: "Get experiment result summary.",
    summary: "Use when you care about winners, significance, or exposure count.",
    tags: ["posthog", "experiments", "analysis"],
    toolName: "posthog_get_experiment_results",
    inputFields: [
      { name: "experimentId", type: "string", required: true, description: "Experiment id." },
    ],
    buildArgs: (input) => ({
      id: optionalString(input, "experimentId"),
    }),
  }),
  createToolAction({
    id: "posthog.list_dashboards",
    title: "PostHog List Dashboards",
    description: "List dashboards in the active project.",
    summary: "Use when you need a quick survey of saved operator surfaces.",
    tags: ["posthog", "discovery", "dashboards"],
    toolName: "posthog_list_dashboards",
    inputFields: [
      { name: "search", type: "string", required: false, description: "Optional dashboard name filter." },
      { name: "limit", type: "number", required: false, description: "Max dashboards to return." },
    ],
    buildArgs: (input) => ({
      search: optionalString(input, "search"),
      limit: optionalNumber(input, "limit"),
    }),
  }),
  createToolAction({
    id: "posthog.list_insights",
    title: "PostHog List Insights",
    description: "List saved insights in the active project.",
    summary: "Use when you need to find existing analytical assets before building new ones.",
    tags: ["posthog", "discovery", "insights"],
    toolName: "posthog_list_insights",
    inputFields: [
      { name: "search", type: "string", required: false, description: "Optional insight name filter." },
      { name: "limit", type: "number", required: false, description: "Max insights to return." },
    ],
    buildArgs: (input) => ({
      search: optionalString(input, "search"),
      limit: optionalNumber(input, "limit"),
    }),
  }),
  createToolAction({
    id: "posthog.search_entities",
    title: "PostHog Search Entities",
    description: "Search entities by name or description.",
    summary: "Best when you only know a keyword and need to find the right asset.",
    tags: ["posthog", "discovery", "search"],
    toolName: "posthog_search_entities",
    inputFields: [
      { name: "query", type: "string", required: true, description: "Search term." },
      { name: "kind", type: "string", required: false, description: "Optional entity kind filter." },
      { name: "limit", type: "number", required: false, description: "Max results." },
    ],
    buildArgs: (input) => ({
      query: optionalString(input, "query"),
      kind: optionalString(input, "kind"),
      limit: optionalNumber(input, "limit"),
    }),
  }),
  createToolAction({
    id: "posthog.read_schema",
    title: "PostHog Read Data Schema",
    description: "Inspect tracked events and properties.",
    summary: "Use when instrumentation quality or naming is the question.",
    tags: ["posthog", "schema", "instrumentation"],
    toolName: "posthog_read_data_schema",
    inputFields: [
      { name: "search", type: "string", required: false, description: "Optional schema search string." },
      { name: "limit", type: "number", required: false, description: "Max schema entities." },
    ],
    buildArgs: (input) => ({
      search: optionalString(input, "search"),
      limit: optionalNumber(input, "limit"),
    }),
  }),
  createToolAction({
    id: "posthog.read_warehouse_schema",
    title: "PostHog Read Warehouse Schema",
    description: "Inspect warehouse tables and schemas.",
    summary: "Use when debugging warehouse-linked analytics or external data joins.",
    tags: ["posthog", "schema", "warehouse"],
    toolName: "posthog_read_data_warehouse_schema",
    inputFields: [
      { name: "search", type: "string", required: false, description: "Optional warehouse schema search string." },
      { name: "limit", type: "number", required: false, description: "Max warehouse entities." },
    ],
    buildArgs: (input) => ({
      search: optionalString(input, "search"),
      limit: optionalNumber(input, "limit"),
    }),
  }),
  createToolAction({
    id: "posthog.search_docs",
    title: "PostHog Search Docs",
    description: "Search official PostHog documentation.",
    summary: "Use when the question is about how PostHog works, not just project state.",
    tags: ["posthog", "docs", "research"],
    toolName: "posthog_search_docs",
    inputFields: [
      { name: "query", type: "string", required: true, description: "Documentation search query." },
    ],
    buildArgs: (input) => ({
      query: optionalString(input, "query"),
    }),
  }),
];

const routineDefinitions: readonly RoutineDefinition[] = [
  {
    id: "posthog.incident_triage",
    title: "PostHog Incident Triage",
    description: "String together the smallest useful steps for a product-health incident review.",
    summary: "Runs health snapshot first, then errors, then an optional targeted log slice.",
    tags: ["posthog", "incident", "monitoring"],
    actionIds: ["posthog.dashboard_snapshot", "posthog.list_errors", "posthog.query_logs"],
    inputFields: [
      { name: "windowMinutes", type: "number", required: false, description: "Dashboard snapshot window." },
      { name: "topPathsLimit", type: "number", required: false, description: "Dashboard top path limit." },
      { name: "query", type: "string", required: false, description: "Optional log query." },
      { name: "service", type: "string", required: false, description: "Optional log service filter." },
      { name: "level", type: "string", required: false, description: "Optional log level filter." },
      { name: "limit", type: "number", required: false, description: "Optional log result limit." },
    ],
    buildSteps: (input) => {
      const steps: RoutineStep[] = [
        {
          actionId: "posthog.dashboard_snapshot",
          arguments: {
            windowMinutes: optionalNumber(input, "windowMinutes"),
            topPathsLimit: optionalNumber(input, "topPathsLimit"),
          },
        },
        {
          actionId: "posthog.list_errors",
          arguments: {},
        },
      ];

      if (hasTruthyStringInput(input, "query") || hasTruthyStringInput(input, "service") || hasTruthyStringInput(input, "level")) {
        steps.push({
          actionId: "posthog.query_logs",
          arguments: {
            query: optionalString(input, "query"),
            service: optionalString(input, "service"),
            level: optionalString(input, "level"),
            from: optionalString(input, "from"),
            to: optionalString(input, "to"),
            limit: optionalNumber(input, "limit"),
          },
        });
      }

      return steps;
    },
  },
  {
    id: "posthog.flag_release_review",
    title: "PostHog Flag Release Review",
    description: "Review a feature flag with definition, status, blast radius, and current health context.",
    summary: "Good default routine before or during a risky rollout.",
    tags: ["posthog", "flags", "release"],
    actionIds: [
      "posthog.get_feature_flag",
      "posthog.flag_status",
      "posthog.flag_blast_radius",
      "posthog.dashboard_snapshot",
    ],
    inputFields: [
      { name: "flagId", type: "string", required: true, description: "Feature flag id or key." },
      { name: "windowMinutes", type: "number", required: false, description: "Dashboard snapshot window." },
      { name: "topPathsLimit", type: "number", required: false, description: "Dashboard top path limit." },
    ],
    buildSteps: (input) => [
      { actionId: "posthog.get_feature_flag", arguments: { flagId: optionalString(input, "flagId") } },
      { actionId: "posthog.flag_status", arguments: { flagId: optionalString(input, "flagId") } },
      { actionId: "posthog.flag_blast_radius", arguments: { flagId: optionalString(input, "flagId") } },
      {
        actionId: "posthog.dashboard_snapshot",
        arguments: {
          windowMinutes: optionalNumber(input, "windowMinutes"),
          topPathsLimit: optionalNumber(input, "topPathsLimit"),
        },
      },
    ],
  },
  {
    id: "posthog.experiment_review",
    title: "PostHog Experiment Review",
    description: "Review experiment metadata, results, and current health context together.",
    summary: "Best compact routine when deciding whether an experiment is healthy or ready to ship.",
    tags: ["posthog", "experiments", "analysis"],
    actionIds: [
      "posthog.get_experiment",
      "posthog.get_experiment_results",
      "posthog.dashboard_snapshot",
    ],
    inputFields: [
      { name: "experimentId", type: "string", required: true, description: "Experiment id." },
      { name: "windowMinutes", type: "number", required: false, description: "Dashboard snapshot window." },
    ],
    buildSteps: (input) => [
      { actionId: "posthog.get_experiment", arguments: { experimentId: optionalString(input, "experimentId") } },
      { actionId: "posthog.get_experiment_results", arguments: { experimentId: optionalString(input, "experimentId") } },
      { actionId: "posthog.dashboard_snapshot", arguments: { windowMinutes: optionalNumber(input, "windowMinutes") } },
    ],
  },
  {
    id: "posthog.schema_research",
    title: "PostHog Schema Research",
    description: "String together schema lookup, optional warehouse lookup, and docs search.",
    summary: "Best compact routine for instrumentation and modeling questions.",
    tags: ["posthog", "schema", "research"],
    actionIds: [
      "posthog.read_schema",
      "posthog.read_warehouse_schema",
      "posthog.search_docs",
    ],
    inputFields: [
      { name: "search", type: "string", required: true, description: "Schema or docs search term." },
      { name: "includeWarehouse", type: "boolean", required: false, description: "Whether to include warehouse schema lookup." },
      { name: "docsQuery", type: "string", required: false, description: "Optional docs query override." },
      { name: "limit", type: "number", required: false, description: "Optional entity limit." },
    ],
    buildSteps: (input) => {
      const search = optionalString(input, "search");
      const steps: RoutineStep[] = [
        { actionId: "posthog.read_schema", arguments: { search, limit: optionalNumber(input, "limit") } },
      ];

      if (input.includeWarehouse === true) {
        steps.push({
          actionId: "posthog.read_warehouse_schema",
          arguments: { search, limit: optionalNumber(input, "limit") },
        });
      }

      steps.push({
        actionId: "posthog.search_docs",
        arguments: { query: optionalString(input, "docsQuery") ?? search },
      });

      return steps;
    },
  },
  {
    id: "posthog.asset_discovery",
    title: "PostHog Asset Discovery",
    description: "Find saved dashboards, insights, and matching entities around a topic.",
    summary: "Use this before building something new when you suspect the asset already exists.",
    tags: ["posthog", "discovery", "insights"],
    actionIds: [
      "posthog.list_dashboards",
      "posthog.list_insights",
      "posthog.search_entities",
    ],
    inputFields: [
      { name: "search", type: "string", required: true, description: "Topic or keyword to look up." },
      { name: "limit", type: "number", required: false, description: "Optional per-step limit." },
      { name: "kind", type: "string", required: false, description: "Optional entity kind filter." },
    ],
    buildSteps: (input) => {
      const search = optionalString(input, "search");
      const limit = optionalNumber(input, "limit");
      return [
        { actionId: "posthog.list_dashboards", arguments: { search, limit } },
        { actionId: "posthog.list_insights", arguments: { search, limit } },
        { actionId: "posthog.search_entities", arguments: { query: search, kind: optionalString(input, "kind"), limit } },
      ];
    },
  },
];

const actionMap = new Map(actionDefinitions.map((definition) => [definition.id, definition]));

const isToolAvailable = (toolName: AgentToolName, capabilities: IntegrationCapabilitySnapshot): boolean => {
  const tool = getRegisteredTool(toolName);
  return Boolean(tool?.implemented && tool.isEnabled(capabilities));
};

export class RuntimeOrchestrationService {
  constructor(private readonly config: RuntimeOrchestrationServiceConfig) {}

  listActions(input: { readonly tag?: string; readonly availableOnly?: boolean } = {}) {
    const tag = input.tag?.trim().toLowerCase();
    const actions = actionDefinitions
      .map((definition) => ({
        id: definition.id,
        title: definition.title,
        description: definition.description,
        summary: definition.summary,
        tags: [...definition.tags],
        available: isToolAvailable(definition.toolName, this.config.capabilities),
        toolName: definition.toolName,
        inputFields: definition.inputFields,
      }))
      .filter((definition) => (!tag || definition.tags.some((entry) => entry.toLowerCase() === tag)))
      .filter((definition) => (!input.availableOnly || definition.available));

    return {
      generatedAt: Date.now(),
      actions,
    };
  }

  async runAction(input: { readonly actionId: string; readonly arguments?: Record<string, unknown> }): Promise<RuntimeActionRunResult> {
    const definition = actionMap.get(input.actionId);
    if (!definition) {
      return {
        actionId: input.actionId,
        title: input.actionId,
        ok: false,
        summary: `Unknown action "${input.actionId}".`,
        toolName: null,
        error: {
          code: "action_not_found",
          message: `Unknown action "${input.actionId}".`,
        },
      };
    }

    if (!isToolAvailable(definition.toolName, this.config.capabilities)) {
      return {
        actionId: definition.id,
        title: definition.title,
        ok: false,
        summary: `Action "${definition.title}" is unavailable because tool "${definition.toolName}" is disabled.`,
        toolName: definition.toolName,
        error: {
          code: "action_tool_unavailable",
          message: `Tool "${definition.toolName}" is disabled in the current runtime configuration.`,
        },
      };
    }

    const toolCall = await this.config.executeTool(definition.toolName, definition.buildArgs(toRecord(input.arguments)));
    if (!toolCall.ok) {
      return {
        actionId: definition.id,
        title: definition.title,
        ok: false,
        summary: `${definition.title} failed: ${toolCall.error?.message ?? "unknown error"}`,
        toolName: definition.toolName,
        output: toolCall.data,
        error: toolCall.error,
      };
    }

    return {
      actionId: definition.id,
      title: definition.title,
      ok: true,
      summary: `${definition.title} completed.`,
      toolName: definition.toolName,
      output: toolCall.data,
    };
  }

  listRoutines(input: { readonly tag?: string; readonly availableOnly?: boolean } = {}) {
    const tag = input.tag?.trim().toLowerCase();
    const routines = routineDefinitions
      .map((definition) => ({
        id: definition.id,
        title: definition.title,
        description: definition.description,
        summary: definition.summary,
        tags: [...definition.tags],
        available: definition.actionIds.every((actionId) => {
          const action = actionMap.get(actionId);
          return action ? isToolAvailable(action.toolName, this.config.capabilities) : false;
        }),
        actionIds: [...definition.actionIds],
        inputFields: definition.inputFields,
      }))
      .filter((definition) => (!tag || definition.tags.some((entry) => entry.toLowerCase() === tag)))
      .filter((definition) => (!input.availableOnly || definition.available));

    return {
      generatedAt: Date.now(),
      routines,
    };
  }

  async runRoutine(input: { readonly routineId: string; readonly arguments?: Record<string, unknown> }): Promise<RuntimeRoutineRunResult> {
    const definition = routineDefinitions.find((candidate) => candidate.id === input.routineId);
    if (!definition) {
      return {
        routineId: input.routineId,
        title: input.routineId,
        ok: false,
        summary: `Unknown routine "${input.routineId}".`,
        steps: [],
      };
    }

    const steps: RuntimeActionRunResult[] = [];
    for (const step of definition.buildSteps(toRecord(input.arguments))) {
      const result = await this.runAction({
        actionId: step.actionId,
        arguments: step.arguments,
      });
      steps.push(result);
    }

    const ok = steps.every((step) => step.ok);
    return {
      routineId: definition.id,
      title: definition.title,
      ok,
      summary: ok
        ? `${definition.title} completed with ${steps.length} action${steps.length === 1 ? "" : "s"}.`
        : `${definition.title} finished with ${steps.filter((step) => !step.ok).length} failed action${steps.filter((step) => !step.ok).length === 1 ? "" : "s"}.`,
      steps,
    };
  }
}
