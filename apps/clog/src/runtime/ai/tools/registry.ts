import type { z } from "zod";
import type { ZodSchema } from "zod";

export type { ZodSchema };

export interface ToolPermission {
  type: "read" | "write" | "execute";
  resource: string;
  allowlist?: string[];
  denylist?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ZodSchema;
  permissions: ToolPermission[];
}

export interface ToolExecutionResult {
  output: unknown;
  success: boolean;
  durationMs: number;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export interface ToolContext {
  sessionId: string;
  threadId: string;
  workspaceRoot: string;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private handlers = new Map<string, ToolHandler>();
  private context: ToolContext = {
    sessionId: "",
    threadId: "",
    workspaceRoot: ".runtime/workspace",
  };

  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, definition);
    this.handlers.set(definition.name, handler);
  }

  setContext(context: Partial<ToolContext>): void {
    this.context = { ...this.context, ...context };
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    this.checkPermissions(tool, args);

    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`No handler for tool: ${name}`);
    }

    const start = Date.now();
    try {
      const output = await handler(args);
      return { output, success: true, durationMs: Date.now() - start };
    } catch (error) {
      return {
        output: error instanceof Error ? error.message : "Unknown error",
        success: false,
        durationMs: Date.now() - start,
      };
    }
  }

  toVercelTools() {
    return Array.from(this.tools.values()).map((tool) => {
      const zodSchema = tool.parameters;
      return {
        name: tool.name,
        description: tool.description,
        parameters: zodSchema,
      };
    });
  }

  private checkPermissions(tool: ToolDefinition, args: Record<string, unknown>): void {
    for (const perm of tool.permissions) {
      if (perm.type === "write" && perm.resource === "filesystem") {
        const path = args.path as string | undefined;
        if (path && !this.isPathAllowed(path, perm.allowlist, perm.denylist)) {
          throw new Error(`Path not allowed: ${path}`);
        }
      }
      if (perm.type === "execute" && perm.resource === "shell") {
        const cmd = args.command as string | undefined;
        if (cmd && !this.isCommandAllowed(cmd, perm.allowlist, perm.denylist)) {
          throw new Error(`Command not allowed: ${cmd}`);
        }
      }
    }
  }

  private isPathAllowed(
    path: string,
    allowlist?: string[],
    denylist?: string[],
  ): boolean {
    const resolved = Bun.resolveSync(path, this.context.workspaceRoot);
    
    if (denylist?.some((p) => resolved.startsWith(p))) {
      return false;
    }
    if (allowlist?.length && !allowlist.some((p) => resolved.startsWith(p))) {
      return false;
    }
    return resolved.startsWith(this.context.workspaceRoot);
  }

  private isCommandAllowed(
    cmd: string,
    allowlist?: string[],
    denylist?: string[],
  ): boolean {
    const baseCmd = cmd.split(" ")[0] ?? "";
    
    if (denylist?.includes(baseCmd)) {
      return false;
    }
    if (allowlist && allowlist.length > 0 && !allowlist.includes(baseCmd)) {
      return false;
    }
    return true;
  }
}

export const createToolRegistry = (
  posthogApi: unknown,
  vercelClient: unknown,
  githubClient: unknown,
  store: unknown,
): ToolRegistry => {
  const registry = new ToolRegistry();

  return registry;
};
