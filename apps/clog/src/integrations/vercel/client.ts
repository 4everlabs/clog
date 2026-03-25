import type { IntegrationHealthView, RuntimeObservation } from "@clog/types";

interface VercelConfig {
  token?: string;
  projectId?: string;
}

interface VercelDeployment {
  uid: string;
  name: string;
  state: string;
  created: number;
  meta?: { githubCommitMessage?: string };
}

interface VercelLogEntry {
  timestamp: string;
  message: string;
  level: string;
}

export class VercelIntegrationClient {
  private config: VercelConfig;
  private baseUrl = "https://api.vercel.com/v6";

  constructor(config?: VercelConfig) {
    this.config = config ?? {};
  }

  async describeHealth(): Promise<IntegrationHealthView> {
    if (!this.config.token) {
      return {
        kind: "vercel",
        status: "missing-config",
        summary: "Vercel API token not configured (VERCEL_TOKEN)",
        lastCheckedAt: Date.now(),
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/deployments`, {
        headers: { Authorization: `Bearer ${this.config.token}` },
      });

      if (response.ok) {
        return {
          kind: "vercel",
          status: "ready",
          summary: `Connected to Vercel. Project: ${this.config.projectId ?? "default"}`,
          lastCheckedAt: Date.now(),
        };
      }

      return {
        kind: "vercel",
        status: "degraded",
        summary: `Vercel API error: ${response.status}`,
        lastCheckedAt: Date.now(),
      };
    } catch (error) {
      return {
        kind: "vercel",
        status: "degraded",
        summary: `Vercel connection failed: ${error instanceof Error ? error.message : "unknown"}`,
        lastCheckedAt: Date.now(),
      };
    }
  }

  async collectObservations(): Promise<RuntimeObservation[]> {
    const observations: RuntimeObservation[] = [];

    if (!this.config.token) {
      return [
        {
          id: "obs_vercel_config",
          kind: "deploy-risk",
          source: { kind: "vercel", label: "Vercel" },
          summary: "Vercel not configured",
          details: "Set VERCEL_TOKEN to enable deployment monitoring",
          severity: "warning",
          detectedAt: Date.now(),
        },
      ];
    }

    try {
      const recent = await this.listDeployments(undefined, 5);
      const failed = recent.filter((deployment) => deployment.state === "ERROR");

      if (failed.length > 0) {
        observations.push({
          id: "obs_vercel_failed_deploy",
          kind: "deploy-risk",
          source: { kind: "vercel", label: "Vercel" },
          summary: `${failed.length} failed deployment(s)`,
          details: failed.map((deployment) => `${deployment.name}: ${deployment.meta?.githubCommitMessage ?? "no message"}`).join("; "),
          severity: "warning",
          detectedAt: Date.now(),
        });
      }
    } catch {
      // Ignore errors during observation collection.
    }

    return observations;
  }

  async listDeployments(
    project?: string,
    limit = 10,
    state?: string,
  ): Promise<VercelDeployment[]> {
    if (!this.config.token) {
      throw new Error("Vercel not configured");
    }

    const params = new URLSearchParams({ limit: String(limit) });
    if (project) {
      params.set("project", project);
    }
    if (state) {
      params.set("state", state);
    }

    const response = await fetch(`${this.baseUrl}/deployments?${params}`, {
      headers: { Authorization: `Bearer ${this.config.token}` },
    });

    if (!response.ok) {
      throw new Error(`Vercel API error: ${response.status}`);
    }

    const data = await response.json() as { deployments: VercelDeployment[] };
    return data.deployments ?? [];
  }

  async getLogs(deploymentId: string, limit = 100, level?: string): Promise<VercelLogEntry[]> {
    if (!this.config.token) {
      throw new Error("Vercel not configured");
    }

    const params = new URLSearchParams({ limit: String(limit) });
    if (level) {
      params.set("level", level);
    }

    const response = await fetch(`${this.baseUrl}/deployments/${deploymentId}/logs?${params}`, {
      headers: { Authorization: `Bearer ${this.config.token}` },
    });

    if (!response.ok) {
      throw new Error(`Vercel API error: ${response.status}`);
    }

    const data = await response.json() as { logs: VercelLogEntry[] };
    return data.logs ?? [];
  }

  async triggerDeploy(
    project: string,
    branch = "main",
    env?: Record<string, string>,
  ): Promise<{ deploymentId: string; url: string }> {
    if (!this.config.token) {
      throw new Error("Vercel not configured");
    }

    const response = await fetch(`${this.baseUrl}/deployments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: project,
        branch,
        env: env ?? {},
        prod: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to trigger deploy: ${response.status} - ${error}`);
    }

    const data = await response.json() as { uid: string; url: string };
    return { deploymentId: data.uid, url: data.url };
  }
}
