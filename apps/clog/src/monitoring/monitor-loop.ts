import type { AgentFinding, IntegrationHealthView } from "@clog/types";
import type { RuntimeStore } from "../storage/chat";

export interface MonitoringIntegration {
  getHealth(): Promise<IntegrationHealthView> | IntegrationHealthView;
}

export interface MonitoringLoopDependencies {
  readonly store: RuntimeStore;
  readonly posthog: MonitoringIntegration;
  readonly github: MonitoringIntegration;
  readonly vercel: MonitoringIntegration;
}

export interface MonitoringTickResult {
  readonly integrationHealth: readonly IntegrationHealthView[];
  readonly findings: readonly AgentFinding[];
  readonly checkedAt: number;
}

export class MonitoringLoop {
  constructor(private readonly deps: MonitoringLoopDependencies) {}

  async tick(): Promise<MonitoringTickResult> {
    this.deps.store.setStatus("monitoring");
    const integrationHealth = await Promise.all([
      this.deps.posthog.getHealth(),
      this.deps.github.getHealth(),
      this.deps.vercel.getHealth(),
    ]);
    this.deps.store.setStatus("idle");

    return {
      integrationHealth,
      findings: this.deps.store.listFindings(),
      checkedAt: Date.now(),
    };
  }
}
