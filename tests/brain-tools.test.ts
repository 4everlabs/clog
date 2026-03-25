import { describe, expect, test } from "bun:test";
import type { AgentFinding, ConversationThread, IntegrationCapabilitySnapshot } from "@clog/types";
import { BrainService } from "../apps/clog/src/brain/service";
import { ToolExecutor } from "../apps/clog/src/execution/tool-executor";
import { buildProviderTools, summarizeEnabledTools } from "../apps/clog/src/tools/registry";

const createCapabilities = (): IntegrationCapabilitySnapshot => ({
  posthog: {
    canReadInsights: true,
    canReadErrors: false,
    canReadLogs: false,
    canReadFlags: false,
    canReadExperiments: false,
    canManageEndpoints: false,
    canUploadSourcemaps: false,
  },
  github: {
    canReadRepository: false,
    canCreatePullRequest: false,
    canPushBranch: false,
  },
  vercel: {
    canTriggerDeploy: false,
  },
  chat: {
    canSendOperatorMessages: true,
    supportedChannels: ["cli"],
  },
  shell: {
    canExecute: false,
    safeCommands: ["ls"],
    safeRoots: ["/workspace"],
  },
});

const createThread = (message: string): ConversationThread => ({
  id: "thread_1",
  title: "Tool Thread",
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

describe("BrainService tool loop", () => {
  test("executes native tools and returns the final assistant text", async () => {
    const capabilities = createCapabilities();
    const requests: Array<Record<string, unknown>> = [];
    const toolExecutor = new ToolExecutor({
      capabilities,
      services: {
        posthog: {
          listErrors: async () => [],
          queryInsight: async (name, query) => ({
            name,
            columns: ["query"],
            results: [{ query }],
          }),
          diffEndpoints: () => {
            throw new Error("not used");
          },
          runEndpoint: () => {
            throw new Error("not used");
          },
        },
        shell: null,
        github: null,
        vercel: null,
      },
    });

    const responses = [
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "posthog_query_insight",
                    arguments: JSON.stringify({
                      name: "Revenue monitor",
                      query: "SELECT 1",
                    }),
                  },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: "I checked the insight and the query returned successfully.",
            },
          },
        ],
      },
    ];

    const brain = new BrainService({
      apiKey: "test-key",
      modelName: "test-model",
      baseUrl: "https://api.openai.com/v1",
      executionMode: "propose",
      availableTools: summarizeEnabledTools(capabilities),
      providerTools: buildProviderTools(capabilities),
      toolExecutor,
      fetchFn: async (_input, init) => {
        requests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        const body = responses.shift();
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
    });

    const reply = await brain.reply({
      thread: createThread("Check the revenue monitor"),
      message: "Check the revenue monitor",
      findings: [createFinding()],
    });

    expect(reply).toContain("query returned successfully");
    expect(requests).toHaveLength(2);
    expect((requests[0]?.tools as Array<{ function: { name: string } }>).map((tool) => tool.function.name)).toEqual([
      "posthog_query_insight",
    ]);
    expect(JSON.stringify(requests[1]?.messages)).toContain("posthog_query_insight");
    expect(JSON.stringify(requests[1]?.messages)).toContain("Revenue monitor");
  });
});
