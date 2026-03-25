import { bootstrapRuntime } from "./bootstrap";
import { startRuntimeServer, type RuntimeServerInfo } from "./server/http-server";

export { bootstrapRuntime } from "./bootstrap";
export { AgentSurfaceTransport, createRuntimeSurfaceHandler } from "./server/http-routes";
export type { RuntimeBootstrap } from "./bootstrap";
export type { RuntimeServerInfo } from "./server/http-server";

export const startDefaultRuntimeServer = async (): Promise<RuntimeServerInfo> => {
  const runtime = bootstrapRuntime();
  const server = startRuntimeServer(runtime);
  console.log(`[clog] runtime ready on ${server.url}`);
  return server;
};

if (import.meta.main) {
  await startDefaultRuntimeServer();
}
