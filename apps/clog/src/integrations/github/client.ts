import type { IntegrationHealthView, RuntimeObservation } from "@clog/types";

export class GitHubIntegrationClient {
  async describeHealth(): Promise<IntegrationHealthView> {
    return {
      kind: "github",
      status: "missing-config",
      summary: "GitHub client not wired yet. Intended for repo read access, branch creation, patching, and PR submission.",
      lastCheckedAt: Date.now(),
    };
  }

  async collectObservations(): Promise<RuntimeObservation[]> {
    return [
      {
        id: "obs_github_stub",
        kind: "repo-risk",
        source: {
          kind: "github",
          label: "GitHub",
        },
        summary: "Repository automation surface is scaffolded but inactive.",
        details: "Future implementation should isolate write access to a dedicated branch or automation branch strategy before PR creation is enabled.",
        severity: "info",
        detectedAt: Date.now(),
        metadata: {
          placeholder: true,
        },
      },
    ];
  }
}
