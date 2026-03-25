import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, resolve } from "node:path";
import type { PostHogCliCommandResponse } from "@clog/types";
import type { PostHogRuntimeConfig } from "../../config";
import type {
  PostHogCliCommandResult,
  PostHogEndpointPullOptions,
  PostHogEndpointRunOptions,
  PostHogSourcemapInjectOptions,
  PostHogSourcemapUploadOptions,
} from "./types";

const WORKSPACE_ROOT = process.cwd();

const normalizeWorkspacePath = (value: string | undefined, fallback: string): string => {
  const raw = value?.trim() || fallback;
  const candidate = isAbsolute(raw) ? raw : resolve(WORKSPACE_ROOT, raw);
  if (!candidate.startsWith(WORKSPACE_ROOT)) {
    throw new Error(`PostHog CLI path must stay inside the workspace: ${candidate}`);
  }

  return candidate;
};

const parseJsonOutput = (stdout: string): unknown => {
  try {
    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
};

export class PostHogCliTool {
  constructor(private readonly config: PostHogRuntimeConfig) {}

  listEndpoints(cwd?: string): PostHogCliCommandResult {
    return this.execute(["exp", "endpoints", "list"], cwd);
  }

  pullEndpoints(options: PostHogEndpointPullOptions = {}): PostHogCliCommandResult {
    const args = ["exp", "endpoints", "pull"];
    if (options.endpointName?.trim()) {
      args.push(options.endpointName.trim());
    } else {
      args.push("--all");
    }

    const outputDirectory = normalizeWorkspacePath(options.outputDirectory, this.config.endpointsDir);
    args.push("-o", outputDirectory);
    return this.execute(args, outputDirectory);
  }

  diffEndpoints(path: string, cwd?: string): PostHogCliCommandResult {
    const targetPath = normalizeWorkspacePath(path, this.config.endpointsDir);
    return this.execute(["exp", "endpoints", "diff", targetPath], cwd ?? WORKSPACE_ROOT);
  }

  runEndpoint(options: PostHogEndpointRunOptions): PostHogCliCommandResult {
    const endpointName = options.endpointName?.trim();
    const filePath = options.filePath?.trim();

    if ((endpointName ? 1 : 0) + (filePath ? 1 : 0) !== 1) {
      throw new Error("runEndpoint requires exactly one of endpointName or filePath");
    }

    const args = ["exp", "endpoints", "run"];
    let cwd = options.cwd;

    if (endpointName) {
      args.push(endpointName);
    } else if (filePath) {
      const normalized = normalizeWorkspacePath(filePath, this.config.endpointsDir);
      args.push("-f", normalized);
      cwd = cwd ?? dirname(normalized);
    }

    for (const [key, value] of Object.entries(options.variables ?? {})) {
      args.push("--var", `${key}=${value}`);
    }
    if (options.json ?? true) {
      args.push("--json");
    }

    return this.execute(args, cwd, options.json ?? true);
  }

  pushEndpointsDryRun(path: string, cwd?: string): PostHogCliCommandResult {
    const targetPath = normalizeWorkspacePath(path, this.config.endpointsDir);
    return this.execute(["exp", "endpoints", "push", targetPath, "--dry-run"], cwd ?? WORKSPACE_ROOT);
  }

  injectSourcemaps(options: PostHogSourcemapInjectOptions): PostHogCliCommandResult {
    const directory = normalizeWorkspacePath(options.directory, WORKSPACE_ROOT);
    return this.execute(["sourcemap", "inject", "--directory", directory], directory);
  }

  uploadSourcemaps(options: PostHogSourcemapUploadOptions): PostHogCliCommandResult {
    const directory = normalizeWorkspacePath(options.directory, WORKSPACE_ROOT);
    const args = [
      "sourcemap",
      "upload",
      "--directory",
      directory,
      "--release-name",
      options.releaseName,
    ];

    if (options.releaseVersion?.trim()) {
      args.push("--release-version", options.releaseVersion.trim());
    }
    if (options.deleteAfter) {
      args.push("--delete-after");
    }

    return this.execute(args, directory);
  }

  private execute(args: string[], cwd?: string, parseJson = false): PostHogCliCommandResponse {
    const missing: string[] = [];
    if (!this.config.projectId) {
      missing.push("POSTHOG_CLAW_POSTHOG_PROJECT_ID");
    }
    if (!this.config.personalApiKey) {
      missing.push("POSTHOG_CLAW_POSTHOG_PERSONAL_API_KEY");
    }
    if (missing.length > 0) {
      throw new Error(`PostHog CLI requires: ${missing.join(", ")}`);
    }

    const workingDirectory = normalizeWorkspacePath(cwd, WORKSPACE_ROOT);
    const startedAt = Date.now();
    const result = spawnSync(this.config.cliBin, args, {
      cwd: workingDirectory,
      env: {
        ...process.env,
        POSTHOG_CLI_HOST: this.config.host,
        POSTHOG_CLI_PROJECT_ID: this.config.projectId ?? undefined,
        POSTHOG_CLI_API_KEY: this.config.personalApiKey ?? undefined,
      },
      encoding: "utf-8",
      maxBuffer: 10_000_000,
      timeout: this.config.cliTimeoutMs,
    });

    if (result.error) {
      throw new Error(`Failed to execute ${this.config.cliBin}: ${result.error.message}`);
    }

    return {
      ok: result.status === 0,
      command: this.config.cliBin,
      args,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.status ?? 0,
      durationMs: Date.now() - startedAt,
      workingDirectory,
      parsedJson: parseJson ? parseJsonOutput(result.stdout ?? "") : undefined,
    };
  }
}
