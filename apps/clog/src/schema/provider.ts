import { z } from "zod";
import { AgentToolNameSchema } from "./tools";

const JsonSchemaSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());

export const ProviderFunctionToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: AgentToolNameSchema,
    description: z.string().min(1),
    parameters: JsonSchemaSchema,
    strict: z.boolean().optional(),
  }).strict(),
}).strict();

export type ProviderFunctionTool = z.infer<typeof ProviderFunctionToolSchema>;

export const ProviderToolCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal("function"),
  function: z.object({
    name: AgentToolNameSchema,
    arguments: z.string(),
  }).strict(),
}).strict();

export type ProviderToolCall = z.infer<typeof ProviderToolCallSchema>;

export const ProviderRequestMessageSchema = z.union([
  z.object({
    role: z.literal("system"),
    content: z.string(),
  }).strict(),
  z.object({
    role: z.literal("user"),
    content: z.string(),
  }).strict(),
  z.object({
    role: z.literal("assistant"),
    content: z.string().nullable(),
    tool_calls: z.array(ProviderToolCallSchema).optional(),
  }).strict(),
  z.object({
    role: z.literal("tool"),
    tool_call_id: z.string().min(1),
    content: z.string(),
  }).strict(),
]);

export type ProviderRequestMessage = z.infer<typeof ProviderRequestMessageSchema>;

export const ProviderChatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  temperature: z.number(),
  max_tokens: z.number().int().positive(),
  messages: z.array(ProviderRequestMessageSchema).min(1),
  tools: z.array(ProviderFunctionToolSchema).optional(),
}).strict();

export type ProviderChatCompletionRequest = z.infer<typeof ProviderChatCompletionRequestSchema>;

export const ProviderAssistantMessageSchema = z.object({
  role: z.literal("assistant").optional(),
  content: z.string().nullable().optional(),
  tool_calls: z.array(ProviderToolCallSchema).optional(),
}).strict();

export type ProviderAssistantMessage = z.infer<typeof ProviderAssistantMessageSchema>;

export const ProviderChatCompletionResponseSchema = z.object({
  choices: z.array(z.object({
    message: ProviderAssistantMessageSchema,
  }).strict()).min(1),
}).strict();

export type ProviderChatCompletionResponse = z.infer<typeof ProviderChatCompletionResponseSchema>;
