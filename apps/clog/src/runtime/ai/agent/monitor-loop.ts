import type { AgentFinding, IntegrationHealthView, RuntimeObservation } from "@clog/types";
import { buildFindingsFromObservations } from "../../../evaluator";
import type { GitHubIntegrationClient } from "../../../gateway/integrations/github/client";
import type { PostHogIntegrationClient } from "../../../gateway/integrations/posthog/client";
import type { VercelIntegrationClient } from "../../../gateway/integrations/vercel/client";
import type { RuntimeStore } from "../../storage/store";

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
