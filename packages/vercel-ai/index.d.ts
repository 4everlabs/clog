export type CompletionPayload = {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
};

export class Chat {
  constructor(options?: { apiKey?: string; model?: string });

  readonly completions: {
    create(payload: CompletionPayload): Promise<{
      choices?: Array<{ message?: { content?: string } }>;
    }>;
  };
}
