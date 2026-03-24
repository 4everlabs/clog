import { describe, expect, test } from "bun:test";
import { PostHogCliTool } from "./posthog-cli";

const createConfig = () => ({
  host: "https://us.posthog.com",
  projectId: "12345",
  personalApiKey: "phx_test",
  projectApiKey: null,
  featureFlagsSecureApiKey: null,
  endpointsDir: "posthog/endpoints",
  cliBin: "posthog-cli",
  cliTimeoutMs: 30_000,
  requestTimeoutMs: 10_000,
  enableLogs: false,
  enableFlags: false,
  enableExperiments: false,
  errorLookbackMinutes: 30,
  errorSpikeThreshold: 10,
  errorSpikeMultiplier: 2,
  criticalErrorThreshold: 25,
  insightMonitors: [],
});

describe("PostHogCliTool", () => {
  test("requires exactly one endpoint input for runEndpoint", () => {
    const tool = new PostHogCliTool(createConfig());

    expect(() => tool.runEndpoint({})).toThrow("exactly one of endpointName or filePath");
    expect(() => tool.runEndpoint({ endpointName: "foo", filePath: "bar.yaml" })).toThrow(
      "exactly one of endpointName or filePath",
    );
  });

  test("rejects paths outside the workspace", () => {
    const tool = new PostHogCliTool(createConfig());

    expect(() => tool.diffEndpoints("/tmp/outside")).toThrow("inside the workspace");
  });
});
