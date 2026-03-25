import { spawnSync } from "node:child_process";
import { isAbsolute, resolve, sep } from "node:path";
import type { ShellCommandRequest, ShellCommandResponse } from "@clog/types";

const ALLOWED_COMMANDS = new Set(["ls", "cat", "rg", "grep", "head", "tail", "wc", "find"]);

const normalizeCwd = (cwd: string | undefined): string => {
  if (!cwd) {
    return process.cwd();
  }

  const candidate = isAbsolute(cwd) ? cwd : resolve(process.cwd(), cwd);
  return candidate;
};

const isSafeCommand = (command: string): boolean => ALLOWED_COMMANDS.has(command);

const isWithinRoot = (cwd: string, root: string): boolean => cwd === root || cwd.startsWith(`${root}${sep}`);

export class ShellExecutor {
  static execute(input: ShellCommandRequest, safeRoots: readonly string[]): ShellCommandResponse {
    const rawCommand = input.command.trim();
    if (!rawCommand) {
      throw new Error("Command cannot be empty");
    }
    const [command] = rawCommand.split(/\s+/g);
    if (!command || !isSafeCommand(command)) {
      throw new Error(`Command not permitted: ${command ?? rawCommand}`);
    }

    const cwd = normalizeCwd(input.cwd);
    const safeLookup = safeRoots.map((root) => resolve(root));
    const safe = safeLookup.some((root) => isWithinRoot(cwd, root));
    if (!safe) {
      throw new Error(`Working directory ${cwd} is outside of allowed roots`);
    }

    const args = input.args ?? [];
    const start = Date.now();
    const result = spawnSync(command, args, {
      cwd,
      env: { ...process.env, ...input.env },
      encoding: "utf-8",
      maxBuffer: 10_000_000,
    });

    return {
      ok: result.status === 0,
      command,
      args,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.status ?? 0,
      durationMs: Date.now() - start,
      workingDirectory: cwd,
    };
  }
}
