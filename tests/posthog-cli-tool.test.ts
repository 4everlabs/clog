import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PostHogCliTool } from "../apps/clog/src/ai/integrations/posthog/cli-tool";
import type { PostHogRuntimeConfig } from "../apps/clog/src/runtime/config";

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (path) {
      rmSync(path, { recursive: true, force: true });
    }
  }
});

const createConfig = (workspaceDir: string): PostHogRuntimeConfig => ({
  host: "https://us.posthog.com",
  workspaceDir,
  projectId: "123",
  personalApiKey: "phx_test",
  projectApiKey: "phc_test",
  featureFlagsSecureApiKey: null,
  endpointsDir: join(workspaceDir, "posthog", "endpoints"),
  cliBin: "echo",
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

describe("PostHogCliTool workspace guard", () => {
  test("rejects endpoint diffs outside the runtime workspace", () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "clog-posthog-cli-"));
    cleanupPaths.push(workspaceDir);
    mkdirSync(join(workspaceDir, "posthog", "endpoints"), { recursive: true });
    const cli = new PostHogCliTool(createConfig(workspaceDir));

    const result = cli.diffEndpoints("../../../outside.ts");

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("must stay inside the runtime workspace");
  });

  test("rejects endpoint runs that target files outside the runtime workspace", () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "clog-posthog-cli-"));
    cleanupPaths.push(workspaceDir);
    mkdirSync(join(workspaceDir, "posthog", "endpoints"), { recursive: true });
    const cli = new PostHogCliTool(createConfig(workspaceDir));

    const result = cli.runEndpoint({
      filePath: "../../../outside.ts",
      json: true,
    });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("must stay inside the runtime workspace");
  });

  test("accepts endpoint files inside the runtime workspace", () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "clog-posthog-cli-"));
    cleanupPaths.push(workspaceDir);
    const endpointsDir = join(workspaceDir, "posthog", "endpoints");
    mkdirSync(endpointsDir, { recursive: true });
    writeFileSync(join(endpointsDir, "checkout.ts"), "export default {};\n");
    const cli = new PostHogCliTool(createConfig(workspaceDir));

    const result = cli.runEndpoint({
      filePath: "checkout.ts",
      json: true,
    });

    expect(result.workingDirectory).toBe(endpointsDir);
    expect(result.args).toContain(join(endpointsDir, "checkout.ts"));
  });
});
