import { describe, expect, test } from "bun:test";
import type { IntegrationHealthView, RuntimeObservation } from "@clog/types";
import { MonitoringLoop } from "../apps/clog/src/runtime/monitor-loop";
import { InMemoryRuntimeStore } from "../apps/clog/src/storage/in-memory-runtime-store";

const createHealth = (
  kind: IntegrationHealthView["kind"],
  status: IntegrationHealthView["status"],
): IntegrationHealthView => ({
  kind,
  status,
  summary: `${kind} is ${status}`,
  lastCheckedAt: 1,
});

const createObservation = (): RuntimeObservation => ({
  id: "posthog-error-checkout",
  kind: "error-rate-spike",
  source: {
    kind: "posthog",
    label: "PostHog error tracking",
    referenceId: "checkout",
  },
  summary: "Checkout exceptions are rising",
  details: "The checkout flow is throwing more exceptions than baseline.",
  severity: "critical",
  detectedAt: 10,
});

describe("MonitoringLoop", () => {
  test("creates managed findings from observations and resolves them when they clear", async () => {
    const store = new InMemoryRuntimeStore();
    const observation = createObservation();
    let posthogObservationEnabled = true;
    let githubMissingConfig = true;

    const loop = new MonitoringLoop({
      store,
      posthog: {
        getHealth: async () => createHealth("posthog", "ready"),
        listObservations: async () => posthogObservationEnabled ? [observation] : [],
      },
      github: {
        getHealth: async () => createHealth("github", githubMissingConfig ? "missing-config" : "ready"),
      },
      vercel: {
        getHealth: async () => createHealth("vercel", "ready"),
      },
      notion: {
        getHealth: async () => createHealth("notion", "ready"),
      },
    });

    const firstTick = await loop.tick();
    expect(firstTick.findings.map((finding) => finding.id).sort()).toEqual([
      "integration-health-github",
      "posthog-error-checkout",
    ]);
    expect(firstTick.findings.every((finding) => finding.state === "open")).toBe(true);

    posthogObservationEnabled = false;
    githubMissingConfig = false;

    const secondTick = await loop.tick();
    const resolvedFindings = secondTick.findings.filter((finding) => finding.state === "resolved");
    expect(resolvedFindings.map((finding) => finding.id).sort()).toEqual([
      "integration-health-github",
      "posthog-error-checkout",
    ]);
  });
});
