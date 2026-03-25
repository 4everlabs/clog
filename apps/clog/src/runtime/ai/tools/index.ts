import { ToolRegistry } from "./registry";
import type { PostHogApiClient } from "./posthog-api";
import type { VercelIntegrationClient } from "../../../gateway/integrations/vercel/client";
import type { RuntimeStore } from "../../storage/store";
import * as schemas from "./definitions";
import { createCodeExecutor } from "./code-executor";
import { spawn } from "bun";

export interface ToolDeps {
  posthogApi: PostHogApiClient;
  vercel: VercelIntegrationClient;
  store: RuntimeStore;
  workspaceRoot: string;
}

export interface MCPServer {
  name: string;
  command: string;
  args: string[];
}

export const createToolRegistry = (deps: ToolDeps, mcpServers: MCPServer[] = []): ToolRegistry => {
  const registry = new ToolRegistry();
  const codeExecutor = createCodeExecutor();

  // ═══════════════════════════════════════════════════════════
  // POSTHOG
  // ═══════════════════════════════════════════════════════════

  registry.register(
    {
      name: "posthog_query",
      description: "Run a HogQL query against PostHog. Returns event data, aggregations, metrics.",
      parameters: schemas.posthogQuerySchema,
      permissions: [{ type: "read", resource: "posthog" }],
    },
    async (args) => {
      const { query, name } = args as schemas.PostHogQueryInput;
      return await deps.posthogApi.queryHogQL(name ?? "query", query);
    }
  );

  registry.register(
    {
      name: "posthog_list_errors",
      description: "List recent errors from PostHog with stack traces.",
      parameters: schemas.posthogListErrorsSchema,
      permissions: [{ type: "read", resource: "posthog" }],
    },
    async (args) => {
      const { lookbackMinutes, limit } = args as schemas.PostHogListErrorsInput;
      const query = `
        SELECT uuid, timestamp, properties.$exception_message, 
               properties.$exception_stack, properties.$browser, properties.$os
        FROM events
        WHERE event = '$exception'
          AND timestamp >= now() - interval ${lookbackMinutes} MINUTE
        ORDER BY timestamp DESC
        LIMIT ${limit}
      `;
      const result = await deps.posthogApi.queryHogQL("errors", query);
      return result.results ?? [];
    }
  );

  registry.register(
    {
      name: "posthog_get_insight",
      description: "Get insight data from PostHog using a custom query.",
      parameters: schemas.posthogGetInsightSchema,
      permissions: [{ type: "read", resource: "posthog" }],
    },
    async (args) => {
      const { query } = args as schemas.PostHogGetInsightInput;
      return await deps.posthogApi.runInsightQuery("insight", query);
    }
  );

  registry.register(
    {
      name: "posthog_list_flags",
      description: "List all feature flags in the PostHog project.",
      parameters: schemas.posthogListFlagsSchema,
      permissions: [{ type: "read", resource: "posthog" }],
    },
    async (args) => {
      const { limit } = args as schemas.PostHogListFlagsInput;
      return await deps.posthogApi.listFeatureFlags(limit);
    }
  );

  // ═══════════════════════════════════════════════════════════
  // VERCEL
  // ═══════════════════════════════════════════════════════════

  registry.register(
    {
      name: "vercel_list_deployments",
      description: "List recent Vercel deployments with their status.",
      parameters: schemas.vercelListDeploymentsSchema,
      permissions: [{ type: "read", resource: "vercel" }],
    },
    async (args) => {
      const { project, limit, state } = args as schemas.VercelListDeploymentsInput;
      return await deps.vercel.listDeployments(project, limit, state);
    }
  );

  registry.register(
    {
      name: "vercel_get_logs",
      description: "Get deployment logs from Vercel.",
      parameters: schemas.vercelGetLogsSchema,
      permissions: [{ type: "read", resource: "vercel" }],
    },
    async (args) => {
      const { deploymentId, limit, level } = args as schemas.VercelGetLogsInput;
      return await deps.vercel.getLogs(deploymentId, limit, level);
    }
  );

  registry.register(
    {
      name: "vercel_trigger_deploy",
      description: "Trigger a Vercel deployment. Requires operator approval.",
      parameters: schemas.vercelTriggerDeploySchema,
      permissions: [{ type: "execute", resource: "vercel" }],
    },
    async (args) => {
      const { project, branch } = args as schemas.VercelTriggerDeployInput;
      return await deps.vercel.triggerDeploy(project, branch);
    }
  );

  // ═══════════════════════════════════════════════════════════
  // CODE EXECUTION
  // ═══════════════════════════════════════════════════════════

  registry.register(
    {
      name: "code_execute",
      description: "Execute TypeScript code in a sandbox. Returns console output. Use for data processing, calculations.",
      parameters: schemas.codeExecuteSchema,
      permissions: [{ type: "execute", resource: "code" }],
    },
    async (args) => {
      const { code, timeout, allowNetwork } = args as schemas.CodeExecuteInput;
      const result = await codeExecutor.execute(code, { 
        timeoutMs: Math.min(timeout ?? 30000, 60000), 
        allowNetwork: allowNetwork ?? false 
      });
      return result;
    }
  );

  // ═══════════════════════════════════════════════════════════
  // FILE OPERATIONS
  // ═══════════════════════════════════════════════════════════

  registry.register(
    {
      name: "file_read",
      description: "Read a file from the workspace.",
      parameters: schemas.fileReadSchema,
      permissions: [{ type: "read", resource: "filesystem", allowlist: [deps.workspaceRoot] }],
    },
    async (args) => {
      const { path } = args as schemas.FileReadInput;
      const { readFileSync } = await import("fs");
      try {
        const content = readFileSync(path, "utf-8");
        return { content, path, success: true };
      } catch (error) {
        throw new Error(`Failed to read ${path}: ${error instanceof Error ? error.message : "unknown"}`);
      }
    }
  );

  registry.register(
    {
      name: "file_write",
      description: "Write content to a file in the workspace.",
      parameters: schemas.fileWriteSchema,
      permissions: [{ type: "write", resource: "filesystem", allowlist: [deps.workspaceRoot] }],
    },
    async (args) => {
      const { path, content } = args as schemas.FileWriteInput;
      const { writeFileSync, mkdirSync } = await import("fs");
      try {
        const dir = path.substring(0, path.lastIndexOf("/"));
        mkdirSync(dir, { recursive: true });
        writeFileSync(path, content, "utf-8");
        return { success: true, path, bytesWritten: content.length };
      } catch (error) {
        throw new Error(`Failed to write ${path}: ${error instanceof Error ? error.message : "unknown"}`);
      }
    }
  );

  registry.register(
    {
      name: "file_glob",
      description: "Find files matching a glob pattern in the workspace using ls.",
      parameters: schemas.fileGlobSchema,
      permissions: [{ type: "read", resource: "filesystem", allowlist: [deps.workspaceRoot] }],
    },
    async (args) => {
      const { pattern, path } = args as schemas.FileGlobInput;
      const root = path ?? deps.workspaceRoot;
      const proc = spawn({ cmd: ["find", root, "-name", pattern.replace("*", "*")], stdout: "pipe" });
      const output = await new Response(proc.stdout).text();
      const files = output.split("\n").filter(Boolean).slice(0, 100);
      return { pattern, root, files };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // SHELL
  // ═══════════════════════════════════════════════════════════

  registry.register(
    {
      name: "shell_exec",
      description: "Run a shell command. Only safe read-only commands allowed.",
      parameters: schemas.shellExecSchema,
      permissions: [{ 
        type: "execute", 
        resource: "shell", 
        denylist: ["rm", "rmdir", "mkfs", "dd", ">", ">>", "|", "&&", "||", ";", "`", "$(", "\n"] 
      }],
    },
    async (args) => {
      const { command, timeout } = args as schemas.ShellExecInput;
      const proc = spawn({
        cmd: ["sh", "-c", command],
        timeout: timeout ?? 10000,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      return {
        command,
        exitCode: proc.exitCode ?? -1,
        stdout: stdout.slice(0, 10000),
        stderr: stderr.slice(0, 5000),
      };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // HTTP
  // ═══════════════════════════════════════════════════════════

  registry.register(
    {
      name: "http_request",
      description: "Make an HTTP request. Use for external APIs.",
      parameters: schemas.httpRequestSchema,
      permissions: [{ type: "read", resource: "network" }],
    },
    async (args) => {
      const { url, method, body, headers } = args as schemas.HttpRequestInput;
      const response = await fetch(url, {
        method: method ?? "GET",
        headers: headers ?? {},
        body: body,
      });
      const responseText = await response.text();
      return {
        url,
        status: response.status,
        statusText: response.statusText,
        body: responseText.slice(0, 50000),
      };
    }
  );

  // ═══════════════════════════════════════════════════════════
  // MCP SERVERS
  // ═══════════════════════════════════════════════════════════

  for (const server of mcpServers) {
    registry.register(
      {
        name: `mcp_${server.name}`,
        description: `Call ${server.name} MCP server tool.`,
        parameters: z.object({
          tool: z.string().describe("Tool name to call"),
          args: z.record(z.unknown()).optional().describe("Arguments"),
        }).describe(`MCP server: ${server.name}`),
        permissions: [{ type: "execute", resource: "mcp", allowlist: [server.name] }],
      },
      async (args) => {
        const { tool, args: toolArgs } = args as { tool: string; args?: Record<string, unknown> };
        // MCP stdio protocol - simplified
        const request = JSON.stringify({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: `tools/${tool}`,
          params: { arguments: toolArgs ?? {} },
        });
        
        const proc = spawn([server.command, ...server.args], {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        });
        
        await proc.stdin.write(request + "\n");
        proc.stdin.end();
        
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        
        try {
          return JSON.parse(stdout.split("\n").filter(Boolean)[0] || "{}");
        } catch {
          return { error: "Failed to parse MCP response", stdout, stderr };
        }
      }
    );
  }

  return registry;
};

import { z } from "zod";
