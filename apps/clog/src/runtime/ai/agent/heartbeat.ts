import type { AgentFinding, IntegrationHealthView, RuntimeObservation } from "@clog/types";
import type { PostHogIntegrationClient } from "../../../gateway/integrations/posthog/client";
import type { VercelIntegrationClient } from "../../../gateway/integrations/vercel/client";
import type { GitHubIntegrationClient } from "../../../gateway/integrations/github/client";
import type { RuntimeStore } from "../../storage/store";
import { buildFindingsFromObservations } from "../../../evaluator";

export interface HeartbeatTask {
  id: string;
  name: string;
  description: string;
  intervalMs: number;
  enabled: boolean;
  run: () => Promise<HeartbeatTaskResult>;
}

export interface HeartbeatTaskResult {
  observations: RuntimeObservation[];
  findings: AgentFinding[];
  shouldNotify: boolean;
  notifyMessage?: string;
}

export interface HeartbeatDeps {
  store: RuntimeStore;
  posthog: PostHogIntegrationClient;
  vercel: VercelIntegrationClient;
  github: GitHubIntegrationClient;
  notifyOperator: (message: string, findings: AgentFinding[]) => Promise<void>;
}

export class HeartbeatScheduler {
  private timers = new Map<string, ReturnType<typeof setTimeout>>(); // eslint-disable-line no-undef
  private tasks = new Map<string, HeartbeatTask>();
  private running = false;
  private readonly deps: HeartbeatDeps;

  constructor(deps: HeartbeatDeps) {
    this.deps = deps;
  }

  static create(deps: HeartbeatDeps): HeartbeatScheduler {
    return new HeartbeatScheduler(deps);
  }

  register(task: HeartbeatTask): void {
    this.tasks.set(task.id, task);
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    for (const task of this.tasks.values()) {
      if (task.enabled) {
        this.scheduleTask(task);
      }
    }
  }

  stop(): void {
    this.running = false;
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  async runNow(taskId: string): Promise<HeartbeatTaskResult | null> {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    return this.executeTask(task);
  }

  listTasks(): HeartbeatTask[] {
    return Array.from(this.tasks.values());
  }

  private scheduleTask(task: HeartbeatTask): void {
    const run = async () => {
      if (!this.running) return;
      
      await this.executeTask(task);
      
      this.timers.set(
        task.id,
        setTimeout(run, task.intervalMs),
      );
    };

    this.timers.set(
      task.id,
      setTimeout(run, task.intervalMs),
    );
  }

  private async executeTask(task: HeartbeatTask): Promise<HeartbeatTaskResult> {
    const result = await task.run();

    if (result.shouldNotify && result.notifyMessage) {
      await this.deps.notifyOperator(result.notifyMessage, result.findings);
    }

    if (result.findings.length > 0) {
      this.deps.store.upsertFindings(result.findings);
    }

    return result;
  }
}

export const createDefaultHeartbeatTasks = (deps: HeartbeatDeps): HeartbeatTask[] => {
  const { store, posthog, vercel, github } = deps;

  return [
    {
      id: "posthog-error-check",
      name: "PostHog Error Monitor",
      description: "Check for error spikes in PostHog",
      intervalMs: 60 * 1000, // 1 minute
      enabled: true,
      run: async () => {
        const observations = await posthog.collectObservations();
        const findings = buildFindingsFromObservations(observations);
        
        const criticalFindings = findings.filter(
          (f) => f.severity === "critical" && f.state === "open"
        );

        return {
          observations,
          findings,
          shouldNotify: criticalFindings.length > 0,
          notifyMessage: criticalFindings.length > 0
            ? `🚨 ${criticalFindings.length} critical error(s) detected in PostHog`
            : undefined,
        };
      },
    },
    {
      id: "posthog-insight-check",
      name: "PostHog Insight Monitor",
      description: "Check for regressions in configured insights",
      intervalMs: 5 * 60 * 1000, // 5 minutes
      enabled: true,
      run: async () => {
        const observations = await posthog.listInsightObservations?.() ?? [];
        const findings = buildFindingsFromObservations(observations);
        
        return {
          observations,
          findings,
          shouldNotify: findings.some((f) => f.severity === "warning"),
          notifyMessage: findings.length > 0
            ? `📊 Insight regression detected: ${findings.map((f) => f.title).join(", ")}`
            : undefined,
        };
      },
    },
    {
      id: "vercel-health-check",
      name: "Vercel Health Monitor",
      description: "Check Vercel deployment health",
      intervalMs: 5 * 60 * 1000, // 5 minutes
      enabled: true,
      run: async () => {
        const observations = await vercel.collectObservations?.() ?? [];
        const findings = buildFindingsFromObservations(observations);
        
        return {
          observations,
          findings,
          shouldNotify: findings.some((f) => f.severity === "critical"),
          notifyMessage: findings.length > 0
            ? `🚀 Vercel issue: ${findings.map((f) => f.title).join(", ")}`
            : undefined,
        };
      },
    },
    {
      id: "integration-health-check",
      name: "Integration Health Check",
      description: "Verify all integrations are healthy",
      intervalMs: 2 * 60 * 1000, // 2 minutes
      enabled: true,
      run: async () => {
        const [posthogHealth, vercelHealth, githubHealth] = await Promise.all([
          posthog.describeHealth(),
          vercel.describeHealth?.() ?? Promise.resolve({ kind: "vercel", status: "unknown", summary: "" }),
          github.describeHealth?.() ?? Promise.resolve({ kind: "github", status: "unknown", summary: "" }),
        ]);

        const unhealthy = [posthogHealth, vercelHealth, githubHealth].filter(
          (h) => h.status !== "ready"
        );

        return {
          observations: [],
          findings: [],
          shouldNotify: unhealthy.length > 0,
          notifyMessage: unhealthy.length > 0
            ? `⚠️ Integration issue: ${unhealthy.map((h) => `${h.kind}: ${h.summary}`).join("; ")}`
            : undefined,
        };
      },
    },
  ];
};
