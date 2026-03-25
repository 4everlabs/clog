import { describe, expect, test } from "bun:test";
import type { AgentFinding, ConversationThread } from "@clog/types";
import { AssistantService } from "../apps/clog/src/assistant/assistant";

const createThread = (message: string): ConversationThread => ({
  id: "thread_1",
  title: "Test Thread",
  channel: "cli",
  createdAt: 1,
  updatedAt: 2,
  messages: [
    {
      id: "msg_1",
      role: "user",
      channel: "cli",
      content: message,
      createdAt: 2,
    },
  ],
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

describe("AssistantService", () => {
  test("falls back cleanly when no API key is configured", async () => {
    const assistant = new AssistantService({ apiKey: "" });
    const reply = await assistant.reply({
      thread: createThread("hello"),
      message: "hello",
      findings: [],
    });

    expect(reply).toContain('I heard: "hello"');
    expect(reply).toContain("no active findings");
  });

  test("mentions the top finding in fallback mode", async () => {
    const assistant = new AssistantService({ apiKey: "" });
    const finding = createFinding();
    const reply = await assistant.reply({
      thread: createThread("what should we do?"),
      message: "what should we do?",
      findings: [finding],
    });

    expect(reply).toContain(finding.title);
    expect(reply).toContain("safest next step");
  });
});
