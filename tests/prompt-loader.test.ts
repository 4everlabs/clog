import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { buildSystemPrompt, loadAiPromptBundle, resolveRuntimeWakeupConfigPath } from "../apps/clog/src/brain/prompt-loader";
import type { ToolSummary } from "../apps/clog/src/schema/tools";

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
      CLOG_INSTANCE_ID: "operator-1",
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
    expect(bundle.knowledgePrompt).not.toContain("PostHog MCP Tool Catalog");
    expect(bundle.integrationKnowledgePrompts.posthog).toContain("PostHog MCP Tool Catalog");
    expect(bundle.primaryModePrompt).toContain("Operating mode");
    expect(bundle.wakeupPrompt).toContain("Wakeup is the periodic monitoring pass");
    expect(bundle.wakeupPrompt).toContain("Check the latest signals");
    expect(bundle.wakeupPrompt).toContain("60000ms");
    expect(buildSystemPrompt(bundle)).toContain("Project Context:");
    expect(buildSystemPrompt(bundle)).toContain("Knowledge Context:");
    expect(buildSystemPrompt(bundle)).toContain("4ever.ai");
    expect(buildSystemPrompt(bundle)).not.toContain("PostHog MCP Tool Catalog");
    const toolSummary: ToolSummary = {
      name: "posthog_run_query",
      title: "PostHog HogQL Query",
      description: "Run a typed PostHog HogQL query.",
      integration: "posthog",
      exposureTier: "discoverable",
      capabilityGroup: "analytics_buildout",
      approvalRequired: false,
      implemented: true,
    };
    expect(buildSystemPrompt(bundle, {
      runtimeContext: "PostHog context: 4ever.ai / app.4ever.ai",
    })).toContain("Runtime Context:");
    expect(buildSystemPrompt(bundle, {
      runtimeContext: "PostHog context: 4ever.ai / app.4ever.ai",
    })).toContain("4ever.ai / app.4ever.ai");
    expect(buildSystemPrompt(bundle, { tools: [toolSummary] })).toContain("Tool access:");
    expect(buildSystemPrompt(bundle, { tools: [toolSummary] })).toContain("Advertised tools: 1");
    expect(buildSystemPrompt(bundle, { tools: [toolSummary] })).toContain("Advertised families: PostHog (1)");
    expect(buildSystemPrompt(bundle, { tools: [toolSummary] })).toContain("Capability groups: Analytics Buildout (1)");
    expect(buildSystemPrompt(bundle, { tools: [toolSummary] })).toContain("PostHog MCP Tool Catalog");
  });

  test("keeps runtime wakeup config optional", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clog-prompt-loader-"));
    cleanupPaths.push(workspaceRoot);

    const bundle = loadAiPromptBundle(
      {
        CLOG_INSTANCE_ID: "missing-instance",
      },
      workspaceRoot,
    );

    expect(bundle.knowledgePrompt).toContain("Clog Role And Boundaries");
    expect(bundle.wakeupPrompt).toContain("Wakeup is the periodic monitoring pass");
  });
});
