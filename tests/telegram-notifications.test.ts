import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { sendTelegramOperatorNotifications } from "../apps/frontends/telegram/src";

const cleanupPaths: string[] = [];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (path) {
      rmSync(path, { recursive: true, force: true });
    }
  }
});

describe("sendTelegramOperatorNotifications", () => {
  test("reuses the saved Telegram target when no live thread metadata is available", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clog-telegram-target-"));
    cleanupPaths.push(workspaceRoot);

    const stateDir = join(workspaceRoot, "state");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, "telegram-target.json"), JSON.stringify({
      threadId: "telegram:123456789:42",
      updatedAt: Date.now(),
    }));

    const fetchCalls: Array<{ readonly url: string; readonly body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input, init) => {
      fetchCalls.push({
        url: String(input),
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch;

    const sent = await sendTelegramOperatorNotifications({
      env: {
        storage: {
          stateDir,
        },
        telegram: {
          botToken: "telegram-token",
          allowedChatIds: [],
        },
      },
      store: {
        listThreads: () => [],
      },
    } as never, "Hello from startup");

    expect(sent).toBe(1);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.body.chat_id).toBe("123456789");
    expect(fetchCalls[0]?.body.message_thread_id).toBe(42);
    expect(fetchCalls[0]?.body.text).toContain("Hello from startup");
  });
});
