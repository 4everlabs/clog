import { parseArgs } from "node:util";
import { bootstrapRuntime } from "./runtime/bootstrap";
import { getRuntimeProcessEnv } from "./runtime/config";
import { loadRuntimeWakeupConfig } from "./runtime/config/wakeup";
import { DailyWakeupScheduler, resolveStartupWakeupRun, runResolvedWakeup } from "./runtime/wakeup-scheduler";
import { PostHogPerformanceReporter } from "./ai/integrations/posthog/performance-reporter";
import { startRuntimeServer, type RuntimeServerInfo } from "./runtime/server";
import { initializeRuntimeLogCapture } from "./storage/logs";
import { startTelegramSurface } from "../../frontends/telegram/src";
import type { RuntimeBootstrap } from "./runtime/bootstrap";

const writeStdoutLine = (value: string): void => {
  process.stdout.write(`${value}\n`);
};

const writeStderrLine = (value: string): void => {
  process.stderr.write(`${value}\n`);
};

export { bootstrapRuntime } from "./runtime/bootstrap";
export { AgentSurfaceTransport, createRuntimeSurfaceHandler } from "./runtime/server";
export type { RuntimeBootstrap } from "./runtime/bootstrap";
export type { RuntimeServerInfo } from "./runtime/server";

export interface RuntimeStartupOptions {
  readonly wakeup: boolean;
}

export interface RuntimeStartupWakeupHooks {
  readonly notifyTelegramReply?: (runtime: RuntimeBootstrap, markdown: string) => Promise<number>;
}

export const parseRuntimeStartupOptions = (
  argv: readonly string[] = process.argv,
): RuntimeStartupOptions => {
  const { values } = parseArgs({
    args: argv.slice(2),
    options: {
      wakeup: {
        type: "boolean",
        default: false,
      },
    },
    allowPositionals: true,
  });

  return {
    wakeup: values.wakeup,
  };
};

export const runStartupWakeup = async (
  runtime: RuntimeBootstrap,
  env: NodeJS.ProcessEnv = getRuntimeProcessEnv(),
  workspaceRoot = process.cwd(),
  hooks: RuntimeStartupWakeupHooks = {},
): Promise<boolean> => {
  const wakeupConfig = loadRuntimeWakeupConfig(env, workspaceRoot);
  if (!wakeupConfig) {
    return false;
  }

  const run = resolveStartupWakeupRun(wakeupConfig);
  if (!run) {
    return false;
  }

  await runResolvedWakeup(runtime, run, "startup", {
    ...hooks,
    logInfo: writeStdoutLine,
    logError: writeStderrLine,
  });
  return true;
};

export const startDefaultRuntimeServer = async (
  options: Partial<RuntimeStartupOptions> = {},
): Promise<RuntimeServerInfo> => {
  initializeRuntimeLogCapture(getRuntimeProcessEnv());
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

  const wakeupScheduler = new DailyWakeupScheduler({
    runtime,
    logInfo: writeStdoutLine,
    logError: writeStderrLine,
  });
  wakeupScheduler.start();
  writeStdoutLine("[clog] daily wakeup scheduler enabled");

  writeStdoutLine(`[clog] runtime ready on ${server.url}`);
  if (options.wakeup) {
    writeStdoutLine("[clog] startup wakeup requested");
    void runStartupWakeup(runtime).then((triggered) => {
      if (!triggered) {
        writeStdoutLine("[clog] startup wakeup skipped because no valid wakeup.json message was found");
      }
    }).catch((error) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      writeStderrLine(`[clog] startup wakeup failed: ${message}`);
    });
  }
  return server;
};

if (import.meta.main) {
  await startDefaultRuntimeServer(parseRuntimeStartupOptions());
}
