import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, resolve, sep } from "node:path";
import type { PostHogEndpointRunRequest, PostHogCliCommandResponse } from "@clog/types";
import type { PostHogRuntimeConfig } from "../../../runtime/config";

const DEFAULT_CLI_PACKAGE = "@posthog/cli";

interface ResolvedCliCommand {
  readonly command: string;
  readonly prefixArgs: readonly string[];
}

const normalizePath = (value: string, cwd: string): string => {
  return isAbsolute(value) ? value : resolve(cwd, value);
};

const isWithinRoot = (candidate: string, root: string): boolean => {
  const normalizedCandidate = resolve(candidate);
  const normalizedRoot = resolve(root);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
};

const buildFailure = (
  command: string,
  args: readonly string[],
  workingDirectory: string,
  stderr: string,
): PostHogCliCommandResponse => ({
  ok: false,
  command,
  args,
  stdout: "",
  stderr,
  exitCode: 1,
  durationMs: 0,
  workingDirectory,
});

const parseJson = (stdout: string): unknown => {
  try {
    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
};

export class PostHogCliTool {
  constructor(private readonly config: PostHogRuntimeConfig) {}

  private resolveCommand(): ResolvedCliCommand {
    const cliBin = this.config.cliBin.trim();
    if (!cliBin || cliBin === "posthog-cli") {
      const bunExecutable = process.execPath?.trim() || "bun";
      return {
        command: bunExecutable,
        prefixArgs: ["x", "--bun", DEFAULT_CLI_PACKAGE],
      };
    }

    return {
      command: cliBin,
      prefixArgs: [],
    };
  }

  private tryResolveWorkingDirectory(cwd?: string): { ok: true; path: string } | { ok: false; error: string } {
    const fallback = existsSync(this.config.endpointsDir) ? this.config.endpointsDir : this.config.workspaceDir;
    const candidate = cwd?.trim()
      ? normalizePath(cwd.trim(), this.config.workspaceDir)
      : fallback;

    if (!isWithinRoot(candidate, this.config.workspaceDir)) {
      return {
        ok: false,
        error: `Working directory must stay inside the runtime workspace: ${candidate}`,
      };
    }

    return {
      ok: true,
      path: candidate,
    };
  }

  private tryResolveWorkspacePath(value: string, cwd: string, label: string): { ok: true; path: string } | { ok: false; error: string } {
    const candidate = normalizePath(value, cwd);
    if (!isWithinRoot(candidate, this.config.workspaceDir)) {
      return {
        ok: false,
        error: `${label} must stay inside the runtime workspace: ${candidate}`,
      };
    }

    return {
      ok: true,
      path: candidate,
    };
  }

  private execute(args: readonly string[], cwd?: string, parseStdoutJson = false): PostHogCliCommandResponse {
    const resolved = this.resolveCommand();
    const workingDirectory = this.tryResolveWorkingDirectory(cwd);
    if (!workingDirectory.ok) {
      return buildFailure(
        resolved.command,
        [...resolved.prefixArgs, ...args],
        this.config.workspaceDir,
        workingDirectory.error,
      );
    }

    const commandArgs = [...resolved.prefixArgs, ...args];
    const start = Date.now();
    const result = spawnSync(resolved.command, commandArgs, {
      cwd: workingDirectory.path,
      env: {
        ...process.env,
        POSTHOG_CLI_API_KEY: this.config.personalApiKey ?? "",
        POSTHOG_CLI_PROJECT_ID: this.config.projectId ?? "",
        POSTHOG_CLI_HOST: this.config.host,
      },
      encoding: "utf-8",
      timeout: this.config.cliTimeoutMs,
      maxBuffer: 10_000_000,
    });

    const durationMs = Date.now() - start;
    const stdout = result.stdout ?? "";
    const stderr = result.error
      ? `${result.stderr ?? ""}${result.stderr ? "\n" : ""}${result.error.message}`.trim()
      : (result.stderr ?? "");

    return {
      ok: result.status === 0 && !result.error,
      command: resolved.command,
      args: commandArgs,
      stdout,
      stderr,
      exitCode: result.status ?? 1,
      durationMs,
      workingDirectory: workingDirectory.path,
      parsedJson: parseStdoutJson ? parseJson(stdout) : undefined,
    };
  }

  listEndpoints(cwd?: string): PostHogCliCommandResponse {
    return this.execute(["exp", "endpoints", "list"], cwd);
  }

  diffEndpoints(path: string, cwd?: string): PostHogCliCommandResponse {
    const workingDirectory = this.tryResolveWorkingDirectory(cwd);
    const resolved = this.resolveCommand();
    if (!workingDirectory.ok) {
      return buildFailure(
        resolved.command,
        [...resolved.prefixArgs, "exp", "endpoints", "diff", path],
        this.config.workspaceDir,
        workingDirectory.error,
      );
    }

    const diffPath = this.tryResolveWorkspacePath(path, workingDirectory.path, "Endpoint path");
    if (!diffPath.ok) {
      return buildFailure(
        resolved.command,
        [...resolved.prefixArgs, "exp", "endpoints", "diff", path],
        workingDirectory.path,
        diffPath.error,
      );
    }

    if (!existsSync(diffPath.path)) {
      return buildFailure(
        resolved.command,
        [...resolved.prefixArgs, "exp", "endpoints", "diff", diffPath.path],
        workingDirectory.path,
        `Endpoint path does not exist: ${diffPath.path}`,
      );
    }

    return this.execute(["exp", "endpoints", "diff", diffPath.path], workingDirectory.path);
  }

  runEndpoint(input: PostHogEndpointRunRequest): PostHogCliCommandResponse {
    const workingDirectory = this.tryResolveWorkingDirectory(input.cwd);
    const args = ["exp", "endpoints", "run"];
    const resolved = this.resolveCommand();
    if (!workingDirectory.ok) {
      return buildFailure(
        resolved.command,
        [...resolved.prefixArgs, ...args],
        this.config.workspaceDir,
        workingDirectory.error,
      );
    }

    if (input.endpointName?.trim()) {
      args.push(input.endpointName.trim());
    } else if (input.filePath?.trim()) {
      const filePath = this.tryResolveWorkspacePath(input.filePath.trim(), workingDirectory.path, "Endpoint file");
      if (!filePath.ok) {
        return buildFailure(
          resolved.command,
          [...resolved.prefixArgs, ...args, "-f", input.filePath.trim()],
          workingDirectory.path,
          filePath.error,
        );
      }

      if (!existsSync(filePath.path)) {
        return buildFailure(
          resolved.command,
          [...resolved.prefixArgs, ...args, "-f", filePath.path],
          workingDirectory.path,
          `Endpoint file does not exist: ${filePath.path}`,
        );
      }
      args.push("-f", filePath.path);
    } else {
      return buildFailure(
        resolved.command,
        [...resolved.prefixArgs, ...args],
        workingDirectory.path,
        "Either endpointName or filePath is required.",
      );
    }

    for (const [key, value] of Object.entries(input.variables ?? {})) {
      args.push("--var", `${key}=${value}`);
    }

    if (input.json) {
      args.push("--json");
    }

    return this.execute(args, workingDirectory.path, input.json === true);
  }
}
