import { describe, expect, test } from "bun:test";
import { RuntimeTerminalOutputFormatter } from "../apps/clog/src/storage/runtime-terminal-output";

describe("RuntimeTerminalOutputFormatter", () => {
  test("collapses verbose Telegram startup blocks into a single readable line", () => {
    const formatter = new RuntimeTerminalOutputFormatter(0, 15_000);

    const output = formatter.formatChunk(
      "stdout",
      [
        "[chat-sdk:telegram] Telegram adapter initialized {",
        '  botUserId: "8225201491",',
        '  userName: "clog4everbot",',
        "}",
        "",
      ].join("\n"),
      1,
    );

    expect(output).toBe("Startup: Connecting Telegram\n");
  });

  test("emits the PostHog startup summary only once", () => {
    const formatter = new RuntimeTerminalOutputFormatter(0, 15_000);

    const first = formatter.formatChunk(
      "stdout",
      '[posthog-mcp] initialized {"endpoint":"https://mcp.posthog.com/mcp","protocolVersion":"2025-06-18"}\n',
      1,
    );
    const second = formatter.formatChunk(
      "stdout",
      '[posthog-mcp] initialized {"endpoint":"https://mcp.posthog.com/mcp","protocolVersion":"2025-06-18"}\n',
      2,
    );

    expect(first).toBe("Startup: PostHog MCP ready\n");
    expect(second).toBe("");
  });

  test("leaves normal runtime logs untouched after startup", () => {
    const formatter = new RuntimeTerminalOutputFormatter(0, 100);

    const output = formatter.formatChunk(
      "stdout",
      "[telegram] received message on telegram:123: hello there\n",
      500,
    );

    expect(output).toBe("[telegram] received message on telegram:123: hello there\n");
  });
});
