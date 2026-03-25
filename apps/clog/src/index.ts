import { bootstrapRuntime } from "./runtime/bootstrap";
import { startRuntimeServer, type RuntimeServerInfo } from "./runtime/server";
import { startCli } from "./runtime/cli";

export { bootstrapRuntime } from "./runtime/bootstrap";
export { AgentSurfaceTransport, createRuntimeSurfaceHandler } from "./runtime/runtime-surface";
export type { RuntimeBootstrap } from "./runtime/bootstrap";
export type { RuntimeServerInfo } from "./runtime/server";

export const startDefaultRuntimeServer = async (): Promise<RuntimeServerInfo> => {
  const runtime = bootstrapRuntime();
  const server = startRuntimeServer(runtime);
  console.log(`[clog] runtime ready on ${server.url}`);
  return server;
};

export const startRuntimeWithCli = async (): Promise<void> => {
  const runtime = bootstrapRuntime();
  
  console.log(`[clog] Starting in CLI mode...`);
  await startCli(runtime);
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  
  if (args.includes("--cli") || args.includes("-c")) {
    await startRuntimeWithCli();
  } else {
    await startDefaultRuntimeServer();
  }
}
