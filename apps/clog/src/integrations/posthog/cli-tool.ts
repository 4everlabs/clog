import type { PostHogEndpointRunRequest, PostHogCliCommandResponse } from "@clog/types";
import type { PostHogRuntimeConfig } from "../../config";

const buildResult = (
  command: string,
  args: readonly string[],
  workingDirectory: string,
  stdout: string,
): PostHogCliCommandResponse => ({
  ok: true,
  command,
  args,
  stdout,
  stderr: "",
  exitCode: 0,
  durationMs: 0,
  workingDirectory,
});

export class PostHogCliTool {
  constructor(private readonly config: PostHogRuntimeConfig) {}

  diffEndpoints(path: string, cwd?: string): PostHogCliCommandResponse {
    return buildResult(
      this.config.cliBin,
      ["diff", path],
      cwd ?? this.config.endpointsDir,
      `Stub diff for ${path}`,
    );
  }

  runEndpoint(input: PostHogEndpointRunRequest): PostHogCliCommandResponse {
    const target = input.endpointName ?? input.filePath ?? "unknown-endpoint";
    return buildResult(
      this.config.cliBin,
      ["run", target],
      input.cwd ?? this.config.endpointsDir,
      `Stub run for ${target}`,
    );
  }
}
