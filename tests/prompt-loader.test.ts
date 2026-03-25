import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSystemPrompt, loadAiPromptBundle, resolveRuntimePromptsDir } from "../apps/clog/src/assistant/prompt-loader";

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
  test("loads instance-scoped wakeup and project prompts from runtime state", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clog-prompt-loader-"));
    cleanupPaths.push(workspaceRoot);

    const env: NodeJS.ProcessEnv = {
      POSTHOG_CLAW_INSTANCE_ID: "operator-1",
    };
    const runtimePromptsDir = resolveRuntimePromptsDir(env, workspaceRoot);

    mkdirSync(runtimePromptsDir, { recursive: true });
    writeFileSync(join(runtimePromptsDir, "project.md"), "# Private Project\n\nThis is operator-owned context.");
    writeFileSync(join(runtimePromptsDir, "wakeup.md"), "# Wakeup\n\nCheck the latest signals.");

    const bundle = loadAiPromptBundle(env, workspaceRoot);

    expect(bundle.projectPrompt).toContain("operator-owned context");
    expect(bundle.wakeupPrompt).toContain("Check the latest signals");
    expect(buildSystemPrompt(bundle)).toContain("Private Project");
  });

  test("keeps runtime prompts optional when the instance folder is missing", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clog-prompt-loader-"));
    cleanupPaths.push(workspaceRoot);

    const bundle = loadAiPromptBundle(
      {
        POSTHOG_CLAW_INSTANCE_ID: "missing-instance",
      },
      workspaceRoot,
    );

    expect(bundle.projectPrompt).toBeNull();
    expect(bundle.wakeupPrompt).toBeNull();
    expect(bundle.systemPrompt).toContain("Clog oversight concierge");
  });
});
