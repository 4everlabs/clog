import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { RuntimeWakeupConfig } from "@clog/types";
import type { RuntimeBootstrap } from "../apps/clog/src/runtime/bootstrap";
import {
  collectDueWakeupRuns,
  DailyWakeupScheduler,
  resolveWakeupOccurrenceTimestamp,
} from "../apps/clog/src/runtime/wakeup-scheduler";

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (path) {
      rmSync(path, { recursive: true, force: true });
    }
  }
});

const createWakeupConfig = (): RuntimeWakeupConfig => ({
  enabled: true,
  prompts: {
    daily: {
      title: "Daily check",
      prompt: "Check in.",
    },
    later: {
      title: "Later check",
      prompt: "Another check in.",
    },
  },
  schedule: [
    {
      promptId: "daily",
      timeUtc: "10:00",
    },
    {
      promptId: "later",
      timeUtc: "12:00",
    },
  ],
});

describe("wakeup scheduler", () => {
  test("calculates occurrence timestamps from UTC times", () => {
    const dayStart = Date.UTC(2026, 3, 18);
    expect(resolveWakeupOccurrenceTimestamp(dayStart, "10:00")).toBe(Date.UTC(2026, 3, 18, 10, 0));
    expect(resolveWakeupOccurrenceTimestamp(dayStart, "23:59")).toBe(Date.UTC(2026, 3, 18, 23, 59));
    expect(resolveWakeupOccurrenceTimestamp(dayStart, "25:00")).toBeNull();
  });

  test("collects due runs inside the requested window", () => {
    const runs = collectDueWakeupRuns(
      createWakeupConfig(),
      Date.UTC(2026, 3, 18, 9, 59, 0),
      Date.UTC(2026, 3, 18, 10, 0, 30),
    );

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      promptId: "daily",
      timeUtc: "10:00",
      occurrenceKey: "2026-04-18:10:00:daily",
    });
  });

  test("does not deliver the same occurrence twice", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clog-wakeup-scheduler-"));
    cleanupPaths.push(workspaceRoot);

    const readOnlyDir = join(workspaceRoot, ".runtime", "instances", "personal-instance", "read-only");
    mkdirSync(readOnlyDir, { recursive: true });
    writeFileSync(join(readOnlyDir, "wakeup.json"), `${JSON.stringify({
      enabled: true,
      prompts: {
        daily: {
          title: "Daily check",
          prompt: "Check in.",
        },
      },
      schedule: [{
        promptId: "daily",
        timeUtc: "10:00",
      }],
    }, null, 2)}\n`);

    const calls: string[] = [];
    let now = Date.UTC(2026, 3, 18, 10, 0, 0, 5);
    const runtime = {
      env: {
        capabilities: {
          chat: {
            canSendOperatorMessages: false,
          },
        },
      },
      gateway: {
        runWakeupPass: async (input: { readonly message: string }) => {
          calls.push(input.message);
          return {
            monitorResult: {
              observations: [],
              integrationHealth: [],
              findings: [],
              checkedAt: now,
            },
            response: {
              thread: {
                id: "thread_1",
              },
              replyMessage: {
                content: "ok",
              },
              recommendedActions: [],
            },
          };
        },
      },
    } as unknown as RuntimeBootstrap;

    const scheduler = new DailyWakeupScheduler({
      runtime,
      workspaceRoot,
      pollIntervalMs: 10,
      now: () => now,
    });

    try {
      scheduler.start();
      await Bun.sleep(25);
      now = Date.UTC(2026, 3, 18, 10, 0, 0, 20);
      await Bun.sleep(25);
    } finally {
      scheduler.stop();
    }

    expect(calls).toEqual(["Check in."]);
  });
});
