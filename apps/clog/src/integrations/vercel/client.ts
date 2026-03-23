import type { IntegrationHealthView, RuntimeObservation } from "@clog/types";

export class VercelIntegrationClient {
  async describeHealth(): Promise<IntegrationHealthView> {
    return {
      kind: "vercel",
      status: "missing-config",
      summary: "Vercel deploy stub is present but not connected to CLI or API execution.",
      lastCheckedAt: Date.now(),
    };
  }

  async collectObservations(): Promise<RuntimeObservation[]> {
    return [
      {
        id: "obs_vercel_stub",
        kind: "deploy-risk",
        source: {
          kind: "vercel",
          label: "Vercel",
        },
        summary: "Deployment action path needs explicit approval policy.",
        details: "Real deploy execution should remain behind operator approval until PR and smoke-check flows are proven safe.",
        severity: "warning",
        detectedAt: Date.now(),
      },
    ];
  }
}
