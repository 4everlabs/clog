import {
  ProviderChatCompletionRequestSchema,
  ProviderChatCompletionResponseSchema,
  type ProviderAssistantMessage,
  type ProviderChatCompletionRequest,
  type ProviderRequestMessage,
} from "../schema/provider";

export interface BuildProviderRequestInput {
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly messages: readonly ProviderRequestMessage[];
  readonly tools?: ProviderChatCompletionRequest["tools"];
}

export const buildProviderChatCompletionRequest = (
  input: BuildProviderRequestInput,
): ProviderChatCompletionRequest => {
  return ProviderChatCompletionRequestSchema.parse({
    model: input.model,
    temperature: input.temperature,
    max_tokens: input.maxTokens,
    messages: input.messages,
    tools: input.tools && input.tools.length > 0 ? input.tools : undefined,
  });
};

export const parseProviderAssistantMessage = (value: unknown): ProviderAssistantMessage => {
  const response = ProviderChatCompletionResponseSchema.parse(value);
  return response.choices[0].message;
};

export const createProviderToolResultMessage = (
  toolCallId: string,
  content: string,
): ProviderRequestMessage => ({
  role: "tool",
  tool_call_id: toolCallId,
  content,
});
