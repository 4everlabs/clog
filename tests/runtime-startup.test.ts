import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import type { RuntimeBootstrap } from "../apps/clog/src/bootstrap";
import { parseRuntimeStartupOptions, runStartupWakeup } from "../apps/clog/src/index";

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (path) {
      rmSync(path, { recursive: true, force: true });
    }
  }
});

describe("runtime startup", () => {
  test("parses the startup wakeup flag", () => {
    expect(parseRuntimeStartupOptions(["bun", "index.ts"])).toEqual({ wakeup: false });
    expect(parseRuntimeStartupOptions(["bun", "index.ts", "--wakeup"])).toEqual({ wakeup: true });
  });

  test("runs one startup wakeup cycle with the configured message", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clog-startup-wakeup-"));
    cleanupPaths.push(workspaceRoot);

    const wakeupDir = join(workspaceRoot, ".runtime", "instances", "personal-instance");
    mkdirSync(wakeupDir, { recursive: true });
    writeFileSync(join(wakeupDir, "wakeup.json"), JSON.stringify({
      intervalMs: 60_000,
      message: "Check the latest signals and summarize the biggest change.",
    }));

    const previousCwd = process.cwd();
    process.chdir(workspaceRoot);

    try {
      const calls: string[] = [];
      let sentMessage: string | null = null;
      let sentThreadId: string | null = null;
      let telegramNotificationMessage: string | null = null;

      const runtime = {
        env: {
          capabilities: {
            chat: {
              canSendOperatorMessages: true,
            },
          },
          telegram: {
            botToken: "telegram-token",
            allowedChatIds: [1001],
          },
        },
        gateway: {
          runMonitorCycle: async () => {
            calls.push("monitor");
            return {
              integrationHealth: [],
              findings: [],
              checkedAt: 1,
            };
          },
          sendMessage: async (input: { readonly threadId?: string; readonly message: string }) => {
            calls.push("send");
            sentMessage = input.message;
            sentThreadId = input.threadId ?? null;
            return {
              thread: {
                id: input.threadId ?? "thread_startup",
              },
              replyMessage: {
                content: "Startup wakeup reply",
              },
              recommendedActions: [],
            };
          },
        },
        store: {
          seedOperatorThread: () => ({
            id: "thread_startup",
          }),
          listThreads: () => [],
        },
      } as unknown as RuntimeBootstrap;

      const triggered = await runStartupWakeup(runtime, process.env, workspaceRoot, {
        notifyTelegramReply: async (_runtime, markdown) => {
          telegramNotificationMessage = markdown;
          return 1;
        },
      });

      expect(triggered).toBe(true);
      expect(calls).toEqual(["monitor", "send"]);
      expect(sentThreadId!).toBe("thread_startup");
      expect(sentMessage!).toBe("Check the latest signals and summarize the biggest change.");
      expect(telegramNotificationMessage!).toBe("Startup wakeup reply");
    } finally {
      process.chdir(previousCwd);
    }
  });
});
