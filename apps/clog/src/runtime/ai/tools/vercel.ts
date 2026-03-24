import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Chat } from "@vercel/ai";
import type { AgentFinding } from "@clog/types";
import type { CompletionPayload } from "@vercel/ai";

const promptsDir = fileURLToPath(new URL("../../ai/prompts/", import.meta.url));
const loadPrompt = (fileName: string): string => readFileSync(join(promptsDir, fileName), "utf-8").trim();
const loadModelSettings = (): Record<string, unknown> | null => {
  try {
    const path = fileURLToPath(new URL("../../../../.runtime/model-settings.json", import.meta.url));
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
};

const SYSTEM_PROMPT = loadPrompt("clog-system.md");
const PRIMARY_MODE_PROMPT = loadPrompt("primary-mode.md");

export class VercelAiRuntime {
  private readonly chat: Chat;
  private readonly systemPrompt = SYSTEM_PROMPT;
  private readonly primaryModePrompt = PRIMARY_MODE_PROMPT;
  private readonly modelSettings = loadModelSettings();

  private constructor(apiKey?: string) {
    this.chat = new Chat({ apiKey, model: "gpt-5.4" });
  }

  static create(): VercelAiRuntime {
    return new VercelAiRuntime(process.env.VERCEL_AI_API_KEY);
  }

  getPrimaryModePrompt(): string {
    return this.primaryModePrompt;
  }

  async summarizeFinding(finding: AgentFinding): Promise<string> {
    const payload: CompletionPayload = {
      messages: [
        {
          role: "system",
          content: this.systemPrompt,
        },
        {
          role: "system",
          content: this.primaryModePrompt,
        },
        {
          role: "system",
          content: `Model settings:\n${JSON.stringify(this.modelSettings ?? {}, null, 2)}`,
        },
        {
          role: "assistant",
          content: `Focus on ${finding.severity} signals and respect runbook safety.`,
        },
        {
          role: "user",
          content: `Summarize the finding for the operator with concision: ${finding.details}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 150,
    };

    const response = await (this.chat as unknown as {
      completions: {
        create: (input: CompletionPayload) => Promise<{
          choices?: Array<{ message?: { content?: string } }>;
        }>;
      };
    }).completions.create(payload);

    return response.choices?.[0]?.message?.content?.trim() ?? finding.summary;
  }
}
