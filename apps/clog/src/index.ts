import { bootstrapRuntime } from "./runtime/bootstrap";
import { startRuntimeServer, type RuntimeServerInfo } from "./runtime/server";

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

if (import.meta.main) {
  await startDefaultRuntimeServer();
}
