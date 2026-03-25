import type { AgentFinding, IntegrationHealthView, RuntimeObservation } from "@clog/types";
import type { GitHubIntegrationClient } from "../../../gateway/integrations/github/client";
import type { PostHogIntegrationClient } from "../../../gateway/integrations/posthog/client";
import type { VercelIntegrationClient } from "../../../gateway/integrations/vercel/client";
import type { RuntimeStore } from "../../storage/store";

const buildFindingsFromObservations = (observations: readonly RuntimeObservation[]): AgentFinding[] => {
  return observations.map((observation) => {
    const proposedActions = [
      {
        id: `action_notify_${observation.id}`,
        kind: "notify" as const,
        title: "Notify operator",
        summary: "Send a structured summary into the active chat channel.",
        approvalRequired: false,
        target: {
          integration: observation.source.kind === "runtime" ? "chat" : observation.source.kind,
          reference: observation.source.referenceId ?? observation.id,
        },
      },
    ];

    if (observation.kind === "repo-risk" || observation.kind === "error-rate-spike" || observation.kind === "insight-regression") {
      proposedActions.push({
        id: `action_pr_${observation.id}`,
        kind: "open-pr",
        title: "Prepare pull request",
        summary: "Create a fix branch, commit the patch, and open a PR for approval.",
        approvalRequired: true,
        target: {
          integration: "github",
          reference: observation.id,
        },
      });
    }

    if (observation.kind === "deploy-risk") {
      proposedActions.push({
        id: `action_deploy_${observation.id}`,
        kind: "deploy",
        title: "Trigger deployment",
        summary: "Run the deployment pathway once the operator approves the remediation plan.",
        approvalRequired: true,
        target: {
          integration: "vercel",
          reference: observation.id,
        },
      });
    }

    return {
      id: `finding_${observation.id}`,
      title: observation.summary,
      severity: observation.severity,
      state: "open" as const,
      summary: observation.summary,
      details: observation.details,
      firstSeenAt: observation.detectedAt,
      lastSeenAt: observation.detectedAt,
      sources: [observation.source],
      observations: [observation],
      proposedActions,
    };
  });
};

export interface MonitoringLoopDependencies {
  readonly store: RuntimeStore;
  readonly posthog: PostHogIntegrationClient;
  readonly github: GitHubIntegrationClient;
  readonly vercel: VercelIntegrationClient;
}

export interface MonitoringTickResult {
  readonly observations: readonly RuntimeObservation[];
  readonly findings: readonly AgentFinding[];
  readonly integrationHealth: readonly IntegrationHealthView[];
}

export class MonitoringLoop {
  constructor(private readonly deps: MonitoringLoopDependencies) {}

  async tick(): Promise<MonitoringTickResult> {
    this.deps.store.setStatus("monitoring");

    const [posthogHealth, githubHealth, vercelHealth] = await Promise.all([
      this.deps.posthog.describeHealth(),
      this.deps.github.describeHealth(),
      this.deps.vercel.describeHealth(),
    ]);

    const observations = [
      ...(await this.deps.posthog.collectObservations()),
      ...(await this.deps.github.collectObservations()),
      ...(await this.deps.vercel.collectObservations()),
    ];

    const findings = buildFindingsFromObservations(observations);
    this.deps.store.upsertFindings(findings);
    this.deps.store.setStatus("idle");

    return {
      observations,
      findings,
      integrationHealth: [posthogHealth, githubHealth, vercelHealth],
    };
  }
}
