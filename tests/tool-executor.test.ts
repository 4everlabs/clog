import { describe, expect, test } from "bun:test";
import type { IntegrationCapabilitySnapshot, RuntimeObservation } from "@clog/types";
import { ToolExecutor } from "../apps/clog/src/execution/tool-executor";

const createCapabilities = (): IntegrationCapabilitySnapshot => ({
  posthog: {
    canReadInsights: true,
    canReadErrors: true,
    canReadLogs: false,
    canReadFlags: false,
    canReadExperiments: false,
    canManageEndpoints: true,
    canUploadSourcemaps: false,
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
    supportedChannels: ["cli"],
  },
  shell: {
    canExecute: true,
    safeCommands: ["ls", "rg"],
    safeRoots: ["/workspace"],
  },
});

const sampleObservation: RuntimeObservation = {
  id: "obs_1",
  kind: "error-rate-spike",
  source: { kind: "posthog", label: "PostHog" },
  summary: "Spike detected",
  details: "Error volume increased",
  severity: "critical",
  detectedAt: 1,
};

describe("ToolExecutor", () => {
  test("executes a typed shell tool and validates the output", async () => {
    const executor = new ToolExecutor({
      capabilities: createCapabilities(),
      services: {
        posthog: null,
        shell: {
          safeRoots: ["/workspace"],
          execute: (input) => ({
            ok: true,
            command: input.command,
            args: input.args ?? [],
            stdout: "done",
            stderr: "",
            exitCode: 0,
            durationMs: 12,
            workingDirectory: input.cwd ?? "/workspace",
          }),
        },
        github: null,
        vercel: null,
      },
    });

    const result = await executor.execute("shell_execute_command", {
      command: "ls",
      args: ["-la"],
      cwd: "/workspace",
    });

    expect(result.ok).toBe(true);
    expect(result.tool.name).toBe("shell_execute_command");
    expect(result.content).toContain("\"stdout\": \"done\"");
  });

  test("returns a typed disabled error when a tool is not available", async () => {
    const capabilities: IntegrationCapabilitySnapshot = {
      ...createCapabilities(),
      shell: {
        ...createCapabilities().shell,
      canExecute: false,
      },
    };

    const executor = new ToolExecutor({
      capabilities,
      services: {
        posthog: null,
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const result = await executor.execute("shell_execute_command", {
      command: "ls",
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("tool_disabled");
  });

  test("parses provider tool calls and executes posthog tools", async () => {
    const executor = new ToolExecutor({
      capabilities: createCapabilities(),
      services: {
        posthog: {
          listErrors: async () => [sampleObservation],
          queryInsight: async (name, query) => ({
            name,
            columns: ["query"],
            results: [{ query }],
          }),
          diffEndpoints: (path) => ({
            ok: true,
            command: "posthog-cli",
            args: ["diff", path],
            stdout: "diff ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
          runEndpoint: () => ({
            ok: true,
            command: "posthog-cli",
            args: ["run"],
            stdout: "run ok",
            stderr: "",
            exitCode: 0,
            durationMs: 1,
            workingDirectory: "/workspace",
          }),
        },
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const result = await executor.executeProviderToolCall({
      id: "call_1",
      type: "function",
      function: {
        name: "posthog_list_errors",
        arguments: "{}",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.content).toContain("Spike detected");
  });
});
