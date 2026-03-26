import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { buildSystemPrompt, loadAiPromptBundle, resolveRuntimeWakeupConfigPath } from "../apps/clog/src/brain/prompt-loader";

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (path) {
      rmSync(path, { recursive: true, force: true });
    }
  }
});

describe("prompt loader", () => {
  test("loads shared repo prompts and runtime wakeup guidance", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clog-prompt-loader-"));
    cleanupPaths.push(workspaceRoot);

    const env: NodeJS.ProcessEnv = {
      POSTHOG_CLAW_INSTANCE_ID: "operator-1",
    };

    const wakeupPath = resolveRuntimeWakeupConfigPath(env, workspaceRoot);
    mkdirSync(dirname(wakeupPath), { recursive: true });
    writeFileSync(
      wakeupPath,
      JSON.stringify({
        intervalMs: 60_000,
        message: "Check the latest signals.",
      }, null, 2),
    );

    const bundle = loadAiPromptBundle(env, workspaceRoot);

    expect(bundle.systemPrompt).toContain("You are `clog`");
    expect(bundle.projectPrompt).toContain("4ever.ai");
    expect(bundle.projectPrompt).toContain("app.4ever.ai");
    expect(bundle.knowledgePrompt).toContain("4ever Product Summary");
    expect(bundle.knowledgePrompt).toContain("Beta Launch Monitoring Priorities");
    expect(bundle.primaryModePrompt).toContain("Operating mode");
    expect(bundle.wakeupPrompt).toContain("Wakeup is the periodic monitoring pass");
    expect(bundle.wakeupPrompt).toContain("Check the latest signals");
    expect(bundle.wakeupPrompt).toContain("60000ms");
    expect(buildSystemPrompt(bundle)).toContain("Project context:");
    expect(buildSystemPrompt(bundle)).toContain("Knowledge summaries:");
    expect(buildSystemPrompt(bundle)).toContain("4ever.ai");
  });

  test("keeps runtime wakeup config optional", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clog-prompt-loader-"));
    cleanupPaths.push(workspaceRoot);

    const bundle = loadAiPromptBundle(
      {
        POSTHOG_CLAW_INSTANCE_ID: "missing-instance",
      },
      workspaceRoot,
    );

    expect(bundle.knowledgePrompt).toContain("Clog Role And Boundaries");
    expect(bundle.wakeupPrompt).toContain("Wakeup is the periodic monitoring pass");
  });
});
