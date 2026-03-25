import { z } from "zod";

export const posthogQuerySchema = z.object({
  query: z.string().describe("HogQL query - e.g. SELECT count() FROM events WHERE event = '$pageview'"),
  name: z.string().optional().describe("Optional name for this query"),
});

export const posthogListErrorsSchema = z.object({
  lookbackMinutes: z.number().optional().default(60).describe("How far back to look (minutes)"),
  limit: z.number().optional().default(20).describe("Max errors to return"),
});

export const posthogGetInsightSchema = z.object({
  query: z.string().describe("Insight query in HogQL"),
});

export const posthogListFlagsSchema = z.object({
  limit: z.number().optional().default(50).describe("Max flags to return"),
});

export const vercelListDeploymentsSchema = z.object({
  project: z.string().optional().describe("Project name filter"),
  limit: z.number().optional().default(10).describe("Max deployments"),
  state: z.enum(["READY", "ERROR", "BUILDING", "CANCELED"]).optional().describe("Filter by state"),
});

export const vercelGetLogsSchema = z.object({
  deploymentId: z.string().describe("Deployment ID"),
  limit: z.number().optional().default(50).describe("Max log lines"),
  level: z.enum(["debug", "info", "warn", "error"]).optional().describe("Filter by level"),
});

export const vercelTriggerDeploySchema = z.object({
  project: z.string().describe("Project name"),
  branch: z.string().optional().default("main").describe("Branch to deploy"),
});

export const codeExecuteSchema = z.object({
  code: z.string().describe("TypeScript code to execute"),
  timeout: z.number().optional().default(30000).describe("Timeout in ms (max 60000)"),
  allowNetwork: z.boolean().optional().default(false).describe("Allow network calls in sandbox"),
});

export const fileReadSchema = z.object({
  path: z.string().describe("File path to read"),
});

export const fileWriteSchema = z.object({
  path: z.string().describe("File path to write"),
  content: z.string().describe("File content"),
});

export const fileGlobSchema = z.object({
  pattern: z.string().describe("Glob pattern - e.g. **/*.ts"),
  path: z.string().optional().describe("Root path to search"),
});

export const shellExecSchema = z.object({
  command: z.string().describe("Shell command to run"),
  timeout: z.number().optional().default(10000).describe("Timeout in ms"),
});

export const mcpCallSchema = z.object({
  server: z.string().describe("MCP server name"),
  tool: z.string().describe("Tool name to call"),
  args: z.record(z.unknown()).optional().describe("Arguments for the tool"),
});

export const httpRequestSchema = z.object({
  url: z.string().describe("URL to fetch"),
  method: z.enum(["GET", "POST"]).optional().default("GET").describe("HTTP method"),
  body: z.string().optional().describe("Request body (JSON string)"),
  headers: z.record(z.string()).optional().describe("HTTP headers"),
});

export type PostHogQueryInput = z.infer<typeof posthogQuerySchema>;
export type PostHogListErrorsInput = z.infer<typeof posthogListErrorsSchema>;
export type PostHogGetInsightInput = z.infer<typeof posthogGetInsightSchema>;
export type PostHogListFlagsInput = z.infer<typeof posthogListFlagsSchema>;
export type VercelListDeploymentsInput = z.infer<typeof vercelListDeploymentsSchema>;
export type VercelGetLogsInput = z.infer<typeof vercelGetLogsSchema>;
export type VercelTriggerDeployInput = z.infer<typeof vercelTriggerDeploySchema>;
export type CodeExecuteInput = z.infer<typeof codeExecuteSchema>;
export type FileReadInput = z.infer<typeof fileReadSchema>;
export type FileWriteInput = z.infer<typeof fileWriteSchema>;
export type FileGlobInput = z.infer<typeof fileGlobSchema>;
export type ShellExecInput = z.infer<typeof shellExecSchema>;
export type MCPCallInput = z.infer<typeof mcpCallSchema>;
export type HttpRequestInput = z.infer<typeof httpRequestSchema>;
