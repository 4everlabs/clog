import { parseArgs } from "node:util";
import { bootstrapRuntime } from "./bootstrap";
import { loadRuntimeWakeupConfig } from "./brain/prompt-loader";
import { PostHogPerformanceReporter } from "./integrations/posthog/performance-reporter";
import { startRuntimeServer, type RuntimeServerInfo } from "./server";
import { initializeRuntimeLogCapture } from "./storage/logs";
import { sendTelegramOperatorNotifications, startTelegramSurface } from "../../frontends/telegram/src";
import type { RuntimeBootstrap } from "./bootstrap";

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
  env: NodeJS.ProcessEnv = process.env,
  workspaceRoot = process.cwd(),
  hooks: RuntimeStartupWakeupHooks = {},
): Promise<boolean> => {
  const wakeupConfig = loadRuntimeWakeupConfig(env, workspaceRoot);
  if (!wakeupConfig) {
    return false;
  }

  const wakeupThread = runtime.store.seedOperatorThread("system", "Startup Wakeups");
  const monitorResult = await runtime.gateway.runMonitorCycle();
  const response = await runtime.gateway.sendMessage({
    channel: "system",
    threadId: wakeupThread.id,
    message: wakeupConfig.message,
  });
  const notifyTelegramReply = hooks.notifyTelegramReply ?? sendTelegramOperatorNotifications;
  const telegramNotifications = runtime.env.capabilities.chat.canSendOperatorMessages
    ? await notifyTelegramReply(runtime, response.replyMessage.content)
    : 0;

  writeStdoutLine(`[clog] startup wakeup checked ${monitorResult.integrationHealth.length} integrations and ${monitorResult.findings.length} findings`);
  writeStdoutLine(`[clog] startup wakeup reply: ${response.replyMessage.content.slice(0, 240)}`);
  if (telegramNotifications > 0) {
    writeStdoutLine(`[clog] startup wakeup sent ${telegramNotifications} Telegram notification${telegramNotifications === 1 ? "" : "s"}`);
  }
  return true;
};

export const startDefaultRuntimeServer = async (
  options: Partial<RuntimeStartupOptions> = {},
): Promise<RuntimeServerInfo> => {
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
