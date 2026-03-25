import { bootstrapRuntime } from "./bootstrap";
import { startRuntimeServer, type RuntimeServerInfo } from "./server";
import { initializeRuntimeLogCapture } from "./storage/logs";
import { startTelegramSurface } from "./telegram";

export { bootstrapRuntime } from "./bootstrap";
export { AgentSurfaceTransport, createRuntimeSurfaceHandler } from "./server";
export type { RuntimeBootstrap } from "./bootstrap";
export type { RuntimeServerInfo } from "./server";

export const startDefaultRuntimeServer = async (): Promise<RuntimeServerInfo> => {
  initializeRuntimeLogCapture();
  const runtime = bootstrapRuntime();
  const server = startRuntimeServer(runtime);

  if (runtime.env.telegram.botToken) {
    console.log("[clog] telegram polling enabled");
    void startTelegramSurface(runtime).catch((error) => {
      console.error("[clog] telegram surface stopped:", error);
    });
  }

  console.log(`[clog] runtime ready on ${server.url}`);
  return server;
};

if (import.meta.main) {
  await startDefaultRuntimeServer();
}
