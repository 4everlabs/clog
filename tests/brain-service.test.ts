import { describe, expect, test } from "bun:test";
import type { AgentFinding, ConversationThread } from "@clog/types";
import { BrainService } from "../apps/clog/src/brain/service";
import type { ToolSummary } from "../apps/clog/src/schema/tools";

const createThread = (message: string): ConversationThread => ({
  id: "thread_1",
  title: "Test Thread",
  channel: "tui",
  createdAt: 1,
  updatedAt: 2,
  messages: [
    {
      id: "msg_1",
      role: "user",
      channel: "tui",
      content: message,
      createdAt: 2,
    },
  ],
});

const createThreadWithMessages = (messages: string[]): ConversationThread => ({
  id: "thread_long",
  title: "Long Thread",
  channel: "tui",
  createdAt: 1,
  updatedAt: 2,
  messages: messages.map((content, index) => ({
    id: `msg_${index + 1}`,
    role: index % 2 === 0 ? "user" : "agent",
    channel: "tui",
    content,
    createdAt: index + 1,
  })),
});

const createFinding = (): AgentFinding => ({
  id: "finding_1",
  title: "Checkout errors are spiking",
  severity: "critical",
  state: "open",
  summary: "Checkout exceptions increased sharply.",
  details: "The checkout flow is throwing more exceptions than baseline.",
  firstSeenAt: 1,
  lastSeenAt: 2,
  sources: [{ kind: "posthog", label: "PostHog" }],
  observations: [],
  proposedActions: [],
});

const createToolSummary = (): ToolSummary => ({
  name: "posthog_run_query",
  title: "PostHog HogQL Query",
  description: "Run a typed PostHog HogQL query against the configured project using the project query API.",
  integration: "posthog",
  approvalRequired: false,
  implemented: true,
});

describe("BrainService", () => {
  test("falls back cleanly when no API key is configured", async () => {
    const brain = new BrainService({ apiKey: "" });
    const reply = await brain.reply({
      thread: createThread("hello"),
      message: "hello",
      findings: [],
    });

    expect(reply).toContain("I don't have a live AI provider configured right now.");
    expect(reply).toContain("no active findings");
  });

  test("mentions the top finding in fallback mode", async () => {
    const brain = new BrainService({ apiKey: "" });
    const finding = createFinding();
    const reply = await brain.reply({
      thread: createThread("what should we do?"),
      message: "what should we do?",
      findings: [finding],
    });

    expect(reply).toContain(finding.title);
    expect(reply).toContain("safest next step");
  });

  test("sends system prompt, primary mode, tool list, then messages in order", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const brain = new BrainService({
      apiKey: "test-key",
      modelName: "test-model",
      baseUrl: "https://api.openai.com/v1",
      executionMode: "propose",
      runtimeContext: "PostHog context: 4ever.ai / app.4ever.ai",
      availableTools: [createToolSummary()],
      fetchFn: async (_input, init) => {
        requests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        return new Response(JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "checked",
              },
            },
          ],
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
    });

    const thread = createThread("does the payload order look right?");
    const reply = await brain.reply({
      thread,
      message: "does the payload order look right?",
      findings: [createFinding()],
    });

    expect(reply).toBe("checked");
    expect(requests).toHaveLength(1);

    const messages = requests[0]?.messages as Array<{ role: string; content: string }>;
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("user");
    expect(messages[1]?.content).toBe("does the payload order look right?");

    const systemPrompt = messages[0]?.content ?? "";
    expect(systemPrompt.indexOf("## Hard Rules")).toBeGreaterThanOrEqual(0);
    expect(systemPrompt.indexOf("Operating mode: `primary`.")).toBeGreaterThan(systemPrompt.indexOf("## Hard Rules"));
    expect(systemPrompt.indexOf("Runtime Context:")).toBeGreaterThan(systemPrompt.indexOf("## Hard Rules"));
    expect(systemPrompt.indexOf("Runtime Context:")).toBeLessThan(systemPrompt.indexOf("Operating mode: `primary`."));
    expect(systemPrompt.indexOf("Tool access:")).toBeGreaterThan(
      systemPrompt.indexOf("Operating mode: `primary`."),
    );
    expect(systemPrompt).toContain("PostHog context: 4ever.ai / app.4ever.ai");
    expect(systemPrompt).toContain("Current thread id: thread_1");
    expect(systemPrompt).toContain("Use runtime_get_conversation with this thread id");
    expect(systemPrompt).not.toContain("Knowledge Context:");
  });

  test("falls back immediately when the provider returns an empty response", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const brain = new BrainService({
      apiKey: "test-key",
      modelName: "test-model",
      baseUrl: "https://api.openai.com/v1",
      fetchFn: async (_input, init) => {
        requests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        return new Response(JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "   ",
              },
            },
          ],
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
    });

    const reply = await brain.reply({
      thread: createThread("what pages are slow?"),
      message: "what pages are slow?",
      findings: [],
    });

    expect(reply).toContain("I couldn't get a live model answer just now.");
    expect(requests).toHaveLength(1);
  });

  test("walks backward through history and drops only the overflow", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const brain = new BrainService({
      apiKey: "test-key",
      modelName: "test-model",
      baseUrl: "https://api.openai.com/v1",
      fetchFn: async (_input, init) => {
        requests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        return new Response(JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "trimmed",
              },
            },
          ],
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
    });

    const thread = createThreadWithMessages([
      `oldest-${"a".repeat(2_600)}`,
      `middle-${"b".repeat(2_600)}`,
      "latest short message",
    ]);

    const reply = await brain.reply({
      thread,
      message: "latest short message",
      findings: [],
    });

    expect(reply).toBe("trimmed");
    const messages = requests[0]?.messages as Array<{ role: string; content: string }>;
    const serializedMessages = JSON.stringify(messages);
    expect(serializedMessages).not.toContain("oldest-");
    expect(serializedMessages).toContain("middle-");
    expect(serializedMessages).toContain("latest short message");
  });

  test("logs a compact dispatch summary instead of the full prompt payload", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const stdoutWrites: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutWrites.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8"));
      return true;
    }) as typeof process.stdout.write;

    try {
      const brain = new BrainService({
        apiKey: "test-key",
        modelName: "test-model",
        baseUrl: "https://api.openai.com/v1",
        executionMode: "propose",
        availableTools: [createToolSummary()],
        fetchFn: async (_input, init) => {
          requests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
          return new Response(JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "checked",
                },
              },
            ],
          }), {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          });
        },
      });

      await brain.reply({
        thread: createThread("this message should not be fully logged"),
        message: "this message should not be fully logged",
        findings: [createFinding()],
      });
    } finally {
      process.stdout.write = originalWrite;
    }

    expect(requests).toHaveLength(1);
    const output = stdoutWrites.join("");
    expect(output).toContain("[brain] dispatching model payload");
    expect(output).toContain("\"messageCount\": 1");
    expect(output).toContain("\"systemPromptChars\":");
    expect(output).not.toContain("## Hard Rules");
    expect(output).not.toContain("this message should not be fully logged");
  });
});
