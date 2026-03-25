import { spawn } from "bun";
import { mkdir, rm, writeFile } from "fs/promises";
import { resolve, join } from "path";

const CODE_WORKSPACE_ROOT = ".runtime/workspace/code";

export interface CodeExecutionOptions {
  timeoutMs?: number;
  memoryLimitMb?: number;
  allowNetwork?: boolean;
  allowedDomains?: string[];
}

export interface CodeExecutionResult {
  output: string;
  error?: string;
  durationMs: number;
  exitCode: number;
}

export class BunCodeExecutor {
  private readonly workspaceRoot: string;
  private readonly defaultOptions: Required<CodeExecutionOptions>;

  constructor(workspaceRoot = CODE_WORKSPACE_ROOT) {
    this.workspaceRoot = workspaceRoot;
    this.defaultOptions = {
      timeoutMs: 30000,
      memoryLimitMb: 256,
      allowNetwork: false,
      allowedDomains: [],
    };
  }

  async execute(
    code: string,
    options: CodeExecutionOptions = {},
  ): Promise<CodeExecutionResult> {
    const opts = { ...this.defaultOptions, ...options };
    const sessionId = crypto.randomUUID();
    const workspace = join(this.workspaceRoot, sessionId);

    const start = Date.now();

    try {
      await mkdir(workspace, { recursive: true });

      const wrappedCode = this.wrapCode(code);
      await writeFile(join(workspace, "script.ts"), wrappedCode);

      const args = this.buildExecutionArgs(opts);
      
      const proc = spawn({
        cmd: ["bun", "run", ...args, join(workspace, "script.ts")],
        cwd: workspace,
        env: this.buildEnvironment(opts),
        stdout: "pipe",
        stderr: "pipe",
      });

      const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => 
        setTimeout(() => resolve({ timedOut: true }), opts.timeoutMs)
      );
      
      const result = await Promise.race([
        proc.exited.then((code) => ({ timedOut: false, code })),
        timeoutPromise,
      ]);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      if ("timedOut" in result && result.timedOut) {
        proc.kill();
        return {
          output: stdout,
          error: `Execution timed out after ${opts.timeoutMs}ms`,
          durationMs: Date.now() - start,
          exitCode: 124,
        };
      }

      return {
        output: stdout,
        error: stderr || undefined,
        durationMs: Date.now() - start,
        exitCode: result.code ?? -1,
      };
    } finally {
      await this.cleanup(workspace);
    }
  }

  private wrapCode(code: string): string {
    return `
"use strict";
const console = {
  log: (...args) => globalThis._output.push(args.map(a => 
    typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
  ).join(' ')),
  error: (...args) => globalThis._output.push('[ERROR] ' + args.join(' ')),
  warn: (...args) => globalThis._output.push('[WARN] ' + args.join(' ')),
};
globalThis._output = [];
try {
  (function() {
    ${code}
  })();
} catch (e) {
  console.error(e.message);
}
console.log('---OUTPUT---');
console.log(globalThis._output.join('\\n'));
`;
  }

  private buildExecutionArgs(opts: Required<CodeExecutionOptions>): string[] {
    const args: string[] = [];
    return args;
  }

  private buildEnvironment(opts: Required<CodeExecutionOptions>): Record<string, string> {
    return {
      PATH: "/usr/bin:/bin",
      HOME: "",
      USER: "",
      ...(opts.allowNetwork ? {} : { NO_NETWORK: "1" }),
    };
  }

  private async cleanup(workspace: string): Promise<void> {
    try {
      await rm(workspace, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }

  isPathAllowed(path: string): boolean {
    const resolved = resolve(path);
    return resolved.startsWith(resolve(this.workspaceRoot));
  }
}

export const createCodeExecutor = (): BunCodeExecutor => {
  return new BunCodeExecutor();
};
