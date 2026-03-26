import { bootstrapRuntime } from "./bootstrap";
import { PostHogPerformanceReporter } from "./integrations/posthog/performance-reporter";
import { startRuntimeServer, type RuntimeServerInfo } from "./server";
import { initializeRuntimeLogCapture } from "./storage/logs";
import { startTelegramSurface } from "../../frontends/telegram/src";

const writeStdoutLine = (value: string): void => {
  process.stdout.write(`${value}\n`);
};

const writeStderrLine = (value: string): void => {
  process.stderr.write(`${value}\n`);
};

export { bootstrapRuntime } from "./bootstrap";
export { AgentSurfaceTransport, createRuntimeSurfaceHandler } from "./server";
export type { RuntimeBootstrap } from "./bootstrap";
export type { RuntimeServerInfo } from "./server";

export const startDefaultRuntimeServer = async (): Promise<RuntimeServerInfo> => {
  initializeRuntimeLogCapture();
  const runtime = bootstrapRuntime();
  const server = startRuntimeServer(runtime);
  if (runtime.env.posthog.projectId && runtime.env.posthog.personalApiKey) {
    const performanceReporter = new PostHogPerformanceReporter({
      workspaceDir: runtime.env.storage.workspaceDir,
      runQuery: async (name, query) => await runtime.posthogApi.runQuery(name, query),
      enqueue: async (operation) => await runtime.gateway.runExclusive(operation),
    });
    performanceReporter.start();
    writeStdoutLine("[clog] posthog performance reporter enabled");
  }

  if (runtime.env.telegram.botToken) {
    writeStdoutLine("[clog] telegram polling enabled");
    void startTelegramSurface(runtime).catch((error) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      writeStderrLine(`[clog] telegram surface stopped: ${message}`);
    });
  }

  writeStdoutLine(`[clog] runtime ready on ${server.url}`);
  return server;
};

if (import.meta.main) {
  await startDefaultRuntimeServer();
}
