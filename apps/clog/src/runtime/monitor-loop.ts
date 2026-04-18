import type {
  AgentFinding,
  IntegrationHealthView,
  ProposedAction,
  RuntimeObservation,
} from "@clog/types";
import type { RuntimeStore } from "../storage/chat";

export interface MonitoringIntegration {
  getHealth(): Promise<IntegrationHealthView> | IntegrationHealthView;
  listObservations?(): Promise<readonly RuntimeObservation[]> | readonly RuntimeObservation[];
}

export interface MonitoringLoopDependencies {
  readonly store: RuntimeStore;
  readonly posthog: MonitoringIntegration;
  readonly github: MonitoringIntegration;
  readonly vercel: MonitoringIntegration;
  readonly notion: MonitoringIntegration;
}

export interface MonitoringTickResult {
  readonly observations: readonly RuntimeObservation[];
  readonly integrationHealth: readonly IntegrationHealthView[];
  readonly findings: readonly AgentFinding[];
  readonly checkedAt: number;
}

const MANAGED_FINDING_PREFIXES = [
  "integration-health-",
  "posthog-error-",
  "posthog-insight-",
] as const;

const uniqueSources = (sources: readonly AgentFinding["sources"][]): AgentFinding["sources"] => {
  const entries = new Map<string, AgentFinding["sources"][number]>();

  for (const batch of sources) {
    for (const source of batch) {
      const key = `${source.kind}:${source.label}:${source.referenceId ?? ""}:${source.url ?? ""}`;
      entries.set(key, source);
    }
  }

  return [...entries.values()];
};

const createObservationActions = (observation: RuntimeObservation): ProposedAction[] => {
  const actions: ProposedAction[] = [{
    id: `${observation.id}-notify`,
    kind: "notify",
    title: "Notify operator",
    summary: `Escalate ${observation.summary.toLowerCase()} to the operator channel.`,
    approvalRequired: false,
    target: {
      integration: observation.source.kind === "runtime" ? "chat" : observation.source.kind,
      reference: observation.id,
    },
  }];

  if (observation.kind === "error-rate-spike" || observation.kind === "insight-regression") {
    actions.push({
      id: `${observation.id}-runbook`,
      kind: "runbook",
      title: "Open incident runbook",
      summary: `Inspect logs, impacted endpoints, and recent deploys for ${observation.summary.toLowerCase()}.`,
      approvalRequired: false,
      target: {
        integration: "posthog",
        reference: observation.id,
      },
    });
  }

  return actions;
};

const createFindingFromObservation = (
  observation: RuntimeObservation,
  existingFinding: AgentFinding | undefined,
): AgentFinding => {
  const observationHistory = [
    ...(existingFinding?.observations ?? []),
    observation,
  ].slice(-8);
  const uniqueObservationMap = new Map(observationHistory.map((entry) => [entry.id, entry]));
  const observations = [...uniqueObservationMap.values()].sort((left, right) => left.detectedAt - right.detectedAt);

  return {
    id: observation.id,
    title: existingFinding?.title ?? observation.summary,
    severity: observation.severity,
    state: existingFinding?.state === "acknowledged" ? "acknowledged" : "open",
    summary: observation.summary,
    details: observation.details,
    firstSeenAt: existingFinding?.firstSeenAt ?? observation.detectedAt,
    lastSeenAt: observation.detectedAt,
    sources: uniqueSources([
      existingFinding?.sources ?? [],
      [observation.source],
    ]),
    observations,
    proposedActions: createObservationActions(observation),
  };
};

const createHealthObservation = (health: IntegrationHealthView, detectedAt: number): RuntimeObservation | null => {
  if (health.status === "ready") {
    return null;
  }

  return {
    id: `integration-health-${health.kind}`,
    kind: "runtime-health",
    source: {
      kind: "runtime",
      label: "Runtime monitoring",
      referenceId: health.kind,
    },
    summary: `${health.kind} integration is ${health.status}`,
    details: health.summary,
    severity: health.status === "degraded" ? "warning" : "critical",
    detectedAt,
    metadata: {
      integration: health.kind,
      status: health.status,
    },
  };
};

const isManagedFinding = (findingId: string): boolean => (
  MANAGED_FINDING_PREFIXES.some((prefix) => findingId.startsWith(prefix))
);

export class MonitoringLoop {
  constructor(private readonly deps: MonitoringLoopDependencies) {}

  async tick(): Promise<MonitoringTickResult> {
    this.deps.store.setStatus("monitoring");
    const checkedAt = Date.now();

    try {
      const integrations = [
        this.deps.posthog,
        this.deps.github,
        this.deps.vercel,
        this.deps.notion,
      ];
      const integrationHealth = await Promise.all(integrations.map((integration) => integration.getHealth()));
      const observationSets = await Promise.all(integrations.map(async (integration) => (
        integration.listObservations ? await integration.listObservations() : []
      )));
      const healthObservations = integrationHealth
        .map((health) => createHealthObservation(health, checkedAt))
        .filter((observation): observation is RuntimeObservation => observation !== null);
      const activeObservations = [...healthObservations, ...observationSets.flat()];
      const activeObservationIds = new Set(activeObservations.map((observation) => observation.id));
      const existingFindings = new Map(this.deps.store.listFindings().map((finding) => [finding.id, finding]));
      const nextManagedFindings = activeObservations.map((observation) => (
        createFindingFromObservation(observation, existingFindings.get(observation.id))
      ));

      for (const finding of this.deps.store.listFindings()) {
        if (
          isManagedFinding(finding.id)
          && finding.state !== "resolved"
          && !activeObservationIds.has(finding.id)
        ) {
          this.deps.store.resolveFindingState(finding.id, "resolved");
        }
      }

      this.deps.store.upsertFindings(nextManagedFindings);

      return {
        observations: activeObservations,
        integrationHealth,
        findings: this.deps.store.listFindings(),
        checkedAt,
      };
    } finally {
      this.deps.store.setStatus("idle");
    }
  }
}
