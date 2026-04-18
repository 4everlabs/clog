import { describe, expect, test } from "bun:test";
import type { IntegrationCapabilitySnapshot } from "@clog/types";
import { RuntimeOrchestrationService } from "../apps/clog/src/runtime/orchestration-service";

const createCapabilities = (): IntegrationCapabilitySnapshot => ({
  posthog: {
    canReadInsights: true,
    canReadErrors: true,
    canReadLogs: true,
    canReadFlags: true,
    canReadExperiments: true,
    canManageEndpoints: false,
    canUploadSourcemaps: false,
  },
  convex: {
    canReadData: false,
  },
  github: {
    canReadRepository: false,
    canCreatePullRequest: false,
    canPushBranch: false,
  },
  vercel: {
    canTriggerDeploy: false,
  },
  chat: {
    canSendOperatorMessages: true,
    supportedChannels: ["tui"],
  },
  notion: {
    canReadTodo: false,
  },
  shell: {
    canExecute: false,
    safeCommands: [],
    safeRoots: [],
  },
});

describe("RuntimeOrchestrationService", () => {
  test("lists actions and routines with availability metadata", () => {
    const service = new RuntimeOrchestrationService({
      capabilities: createCapabilities(),
      executeTool: async () => {
        throw new Error("not used");
      },
    });

    const actions = service.listActions({ tag: "posthog" });
    const routines = service.listRoutines({ availableOnly: true });

    expect(actions.actions.some((action) => action.id === "posthog.dashboard_snapshot" && action.available)).toBe(true);
    expect(routines.routines.some((routine) => routine.id === "posthog.incident_triage" && routine.available)).toBe(true);
  });

  test("runs a routine by stringing together action executions", async () => {
    const calls: Array<{ toolName: string; args: unknown }> = [];
    const service = new RuntimeOrchestrationService({
      capabilities: createCapabilities(),
      executeTool: async (toolName, args) => {
        calls.push({ toolName, args });
        return {
          toolName,
          ok: true,
          content: JSON.stringify({ toolName, args }),
          data: { toolName, args },
          tool: {
            name: toolName,
            title: toolName,
            description: toolName,
            integration: toolName.startsWith("runtime_") ? "runtime" : "posthog",
            exposureTier: toolName.startsWith("runtime_") ? "core" : "discoverable",
            capabilityGroup: toolName.startsWith("runtime_") ? "runtime_context" : "investigation",
            approvalRequired: false,
            implemented: true,
          },
        };
      },
    });

    const result = await service.runRoutine({
      routineId: "posthog.flag_release_review",
      arguments: {
        flagId: "checkout_redesign",
        windowMinutes: 30,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.steps).toHaveLength(4);
    expect(calls.map((call) => call.toolName)).toEqual([
      "posthog_get_feature_flag",
      "posthog_get_feature_flag_status",
      "posthog_get_feature_flag_blast_radius",
      "posthog_get_dashboard_snapshot",
    ]);
    expect(calls[0]?.args).toEqual({ id: "checkout_redesign" });
    expect(calls[3]?.args).toEqual({ windowMinutes: 30, topPathsLimit: undefined });
  });
});
