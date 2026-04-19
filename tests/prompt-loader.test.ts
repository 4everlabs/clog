import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildSystemPrompt,
  loadAiPromptBundle,
} from "../apps/clog/src/ai/brain/prompt-loader";
import {
  loadRuntimeWakeupPrompt,
  normalizeRuntimeWakeupConfig,
  parseRuntimeWakeupTimeUtc,
  resolveRuntimeWakeupConfigPath,
} from "../apps/clog/src/runtime/config/wakeup";
import type { ToolSummary } from "../apps/clog/src/ai/tools/schema/tools";

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
        enabled: true,
        prompts: {
          morning: {
            title: "Morning check",
            prompt: "Check the latest signals.",
          },
        },
        schedule: [{
          promptId: "morning",
          timeUtc: "09:00",
        }],
      }, null, 2),
    );

    const bundle = loadAiPromptBundle(env, workspaceRoot);
    const wakeupPrompt = loadRuntimeWakeupPrompt(bundle.wakeupPrompt, env, workspaceRoot);

    expect(bundle.systemPrompt).toContain("You are `clog`");
    expect(bundle.projectPrompt).toContain("4ever.ai");
    expect(bundle.projectPrompt).toContain("app.4ever.ai");
    expect(bundle.knowledgePrompt).toContain("4ever Product Summary");
    expect(bundle.knowledgePrompt).toContain("Beta Launch Monitoring Priorities");
    expect(bundle.knowledgePrompt).not.toContain("PostHog MCP Tool Catalog");
    expect(bundle.integrationKnowledgePrompts.posthog).toContain("PostHog MCP Tool Catalog");
    expect(bundle.primaryModePrompt).toContain("Operating mode");
    expect(bundle.wakeupPrompt).toContain("Wakeup is the periodic monitoring pass");
    expect(wakeupPrompt).toContain("Runtime wakeup config:");
    expect(wakeupPrompt).toContain("Enabled: yes");
    expect(wakeupPrompt).toContain("Title: Morning check");
    expect(wakeupPrompt).toContain("Check the latest signals");
    expect(wakeupPrompt).toContain("09:00 UTC -> morning");
    expect(buildSystemPrompt(bundle, { wakeupPrompt })).toContain("Project Context:");
    expect(buildSystemPrompt(bundle, { wakeupPrompt })).toContain("Knowledge Context:");
    expect(buildSystemPrompt(bundle, { wakeupPrompt })).toContain("4ever.ai");
    expect(buildSystemPrompt(bundle, { wakeupPrompt })).not.toContain("PostHog MCP Tool Catalog");
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
      wakeupPrompt,
    })).toContain("Runtime Context:");
    expect(buildSystemPrompt(bundle, {
      runtimeContext: "PostHog context: 4ever.ai / app.4ever.ai",
      wakeupPrompt,
    })).toContain("4ever.ai / app.4ever.ai");
    expect(buildSystemPrompt(bundle, { tools: [toolSummary], wakeupPrompt })).toContain("Tool access:");
    expect(buildSystemPrompt(bundle, { tools: [toolSummary], wakeupPrompt })).toContain("Advertised tools: 1");
    expect(buildSystemPrompt(bundle, { tools: [toolSummary], wakeupPrompt })).toContain("Advertised families: PostHog (1)");
    expect(buildSystemPrompt(bundle, { tools: [toolSummary], wakeupPrompt })).toContain("Capability groups: Analytics Buildout (1)");
    expect(buildSystemPrompt(bundle, { tools: [toolSummary], wakeupPrompt })).toContain("PostHog MCP Tool Catalog");
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
    expect(loadRuntimeWakeupPrompt(bundle.wakeupPrompt, { CLOG_INSTANCE_ID: "missing-instance" }, workspaceRoot)).toContain("Wakeup is the periodic monitoring pass");
  });

  test("accepts an explicitly empty wakeup config", () => {
    expect(normalizeRuntimeWakeupConfig({
      enabled: false,
      prompts: {},
      schedule: [],
    })).toEqual({
      enabled: false,
      prompts: {},
      schedule: [],
    });
  });

  test("still rejects partial or invalid wakeup configs", () => {
    expect(normalizeRuntimeWakeupConfig({
      enabled: true,
      prompts: {
        daily: {
          title: "Daily check",
          prompt: "Check the latest signals.",
        },
      },
      schedule: [],
    })).toBeNull();

    expect(normalizeRuntimeWakeupConfig({
      enabled: true,
      prompts: {},
      schedule: [{
        promptId: "daily",
        timeUtc: "09:00",
      }],
    })).toBeNull();

    expect(normalizeRuntimeWakeupConfig({
      enabled: true,
      prompts: {
        daily: {
          title: "Daily check",
          message: "Old wakeup field",
        },
      },
      schedule: [{
        promptId: "daily",
        timeUtc: "09:00",
      }],
    })).toBeNull();

    expect(normalizeRuntimeWakeupConfig({
      prompts: {
        daily: {
          prompt: "Missing target",
        },
      },
      schedule: [{
        promptId: "daily",
        timeUtc: "09:00",
      }],
    })).toBeNull();

    expect(normalizeRuntimeWakeupConfig({
      enabled: true,
      prompts: {
        daily: {
          prompt: "Missing title",
        },
      },
      schedule: [{
        promptId: "daily",
        timeUtc: "09:00",
      }],
    })).toBeNull();
  });

  test("parses UTC wakeup times", () => {
    expect(parseRuntimeWakeupTimeUtc("10:00")).toEqual({
      hour: 10,
      minute: 0,
    });
    expect(parseRuntimeWakeupTimeUtc("23:59")).toEqual({
      hour: 23,
      minute: 59,
    });
    expect(parseRuntimeWakeupTimeUtc("24:00")).toBeNull();
    expect(parseRuntimeWakeupTimeUtc("9:00")).toBeNull();
  });
});
