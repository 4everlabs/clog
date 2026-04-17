#!/usr/bin/env bun

import { emitKeypressEvents } from "readline";
import { fileURLToPath } from "node:url";
import { startDefaultRuntimeServer } from "../../clog/src/index.ts";
import { resolveBackendBaseUrl } from "../../frontends/tui/src/clog-api";
import { startTuiFrontend } from "../../frontends/tui/src/index.ts";

const ANSI = {
  reset: "\u001B[0m",
  dim: "\u001B[2m",
  bold: "\u001B[1m",
  cyan: "\u001B[36m",
  blue: "\u001B[34m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  red: "\u001B[31m",
  white: "\u001B[37m",
  bgBlue: "\u001B[44m",
} as const;

type FrontendChoice = "tui" | "web" | "quit";

interface RuntimeSession {
  readonly baseUrl: string;
  readonly startedByLauncher: boolean;
}

const WEB_FRONTEND_DIRECTORY = fileURLToPath(new URL("../../frontends/web/", import.meta.url));
const WEB_DEV_SERVER_URL = "http://127.0.0.1:4173";
type ChildProcess = ReturnType<typeof Bun.spawn>;

const writeLine = (value = ""): void => {
  process.stdout.write(`${value}\n`);
};

const writeErrorLine = (value: string): void => {
  process.stderr.write(`${value}\n`);
};

const colorize = (value: string, ...codes: readonly string[]): string => {
  return `${codes.join("")}${value}${ANSI.reset}`;
};

const wait = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const runtimeBanner = (): string => {
  return [
    colorize(" ██████╗██╗      ██████╗  ██████╗ ", ANSI.cyan, ANSI.bold),
    colorize("██╔════╝██║     ██╔═══██╗██╔════╝ ", ANSI.cyan, ANSI.bold),
    colorize("██║     ██║     ██║   ██║██║  ███╗", ANSI.blue, ANSI.bold),
    colorize("██║     ██║     ██║   ██║██║   ██║", ANSI.blue, ANSI.bold),
    colorize("╚██████╗███████╗╚██████╔╝╚██████╔╝", ANSI.green, ANSI.bold),
    colorize(" ╚═════╝╚══════╝ ╚═════╝  ╚═════╝ ", ANSI.green, ANSI.bold),
  ].join("\n");
};

const printWelcomeScreen = (session: RuntimeSession): void => {
  writeLine(runtimeBanner());
  writeLine();
  writeLine(colorize("WELCOME TO CLOG", ANSI.bold, ANSI.white));
  writeLine(colorize("Runtime-first oversight agent", ANSI.dim, ANSI.white));
  writeLine();
  writeLine(
    `${colorize("Runtime:", ANSI.bold)} ${session.startedByLauncher ? colorize("started locally", ANSI.green) : colorize("connected", ANSI.green)} ${colorize(session.baseUrl, ANSI.dim)}`,
  );
  writeLine();
  writeLine(colorize("Choose frontend:", ANSI.bold, ANSI.yellow));
  writeLine(`  ${colorize("[1]", ANSI.bgBlue, ANSI.white, ANSI.bold)} ${colorize("TUI", ANSI.bold)}  Full terminal interface`);
  writeLine(`  ${colorize("[2]", ANSI.bgBlue, ANSI.white, ANSI.bold)} ${colorize("Web", ANSI.bold)}  Start browser UI with hot reload`);
  writeLine(`  ${colorize("[q]", ANSI.bgBlue, ANSI.white, ANSI.bold)} ${colorize("Quit", ANSI.bold)} Exit`);
  writeLine();
};

const requestChoice = async (): Promise<FrontendChoice> => {
  writeLine(colorize("Press 1 for TUI, 2 for Web, or q to quit.", ANSI.dim));
  writeLine();

  return await new Promise<FrontendChoice>((resolve) => {
    const stdin = process.stdin;
    const restoreRawMode = stdin.isTTY ? stdin.isRaw : false;

    const cleanup = (): void => {
      stdin.off("keypress", onKeypress);
      if (stdin.isTTY) {
        stdin.setRawMode(restoreRawMode);
      }
      stdin.pause();
    };

    const finish = (choice: FrontendChoice): void => {
      cleanup();
      writeLine();
      resolve(choice);
    };

    const onKeypress = (_value: string, key: { name?: string; sequence?: string; ctrl?: boolean }): void => {
      if (key.ctrl && key.name === "c") {
        finish("quit");
        return;
      }

      if (key.sequence === "1" || key.name === "1") {
        finish("tui");
        return;
      }

      if (key.sequence === "2" || key.name === "2") {
        finish("web");
        return;
      }

      if (key.name === "q" || key.name === "escape") {
        finish("quit");
      }
    };

    emitKeypressEvents(stdin);
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.on("keypress", onKeypress);
  });
};

const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const runtimeIsReachable = async (baseUrl: string): Promise<boolean> => {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/healthz`, 750);
    return response.ok;
  } catch {
    return false;
  }
};

const webDevServerIsReachable = async (): Promise<boolean> => {
  try {
    const response = await fetchWithTimeout(`${WEB_DEV_SERVER_URL}/healthz`, 750);
    return response.ok;
  } catch {
    return false;
  }
};

const ensureRuntime = async (): Promise<RuntimeSession> => {
  const requestedBaseUrl = resolveBackendBaseUrl();
  if (await runtimeIsReachable(requestedBaseUrl)) {
    process.env.CLOG_BACKEND_URL = requestedBaseUrl;
    return {
      baseUrl: requestedBaseUrl,
      startedByLauncher: false,
    };
  }

  let server;
  try {
    server = await startDefaultRuntimeServer();
  } catch (error) {
    if (error instanceof Error && error.message.includes("EADDRINUSE")) {
      await wait(250);
      if (await runtimeIsReachable(requestedBaseUrl)) {
        process.env.CLOG_BACKEND_URL = requestedBaseUrl;
        return {
          baseUrl: requestedBaseUrl,
          startedByLauncher: false,
        };
      }
    }
    throw error;
  }
  process.env.CLOG_BACKEND_URL = server.url;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await runtimeIsReachable(server.url)) {
      return {
        baseUrl: server.url,
        startedByLauncher: true,
      };
    }
    await wait(100);
  }

  throw new Error(`Runtime did not become ready at ${server.url}`);
};

const getBrowserCommand = (url: string): string[] | null => {
  switch (process.platform) {
    case "darwin":
      return ["open", url];
    case "linux":
      return ["xdg-open", url];
    case "win32":
      return ["cmd", "/c", "start", "", url];
    default:
      return null;
  }
};

const openBrowser = async (url: string): Promise<boolean> => {
  const command = getBrowserCommand(url);
  if (!command) {
    return false;
  }

  try {
    const child = Bun.spawn({
      cmd: command,
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
    });
    const exitCode = await child.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
};

const waitForShutdownSignal = async (onSignal?: () => void): Promise<void> => {
  await new Promise<void>((resolve) => {
    const handle = (): void => {
      process.off("SIGINT", handle);
      process.off("SIGTERM", handle);
      onSignal?.();
      resolve();
    };

    process.on("SIGINT", handle);
    process.on("SIGTERM", handle);
  });
};

const startWebDevServer = (session: RuntimeSession): ChildProcess => {
  return Bun.spawn({
    cmd: ["bun", "--bun", "vite", "--host", "127.0.0.1", "--port", "4173"],
    cwd: WEB_FRONTEND_DIRECTORY,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
    env: {
      ...process.env,
      CLOG_BACKEND_URL: session.baseUrl,
    },
  });
};

const ensureWebDevServer = async (
  session: RuntimeSession,
): Promise<{ readonly url: string; readonly child: ChildProcess | null }> => {
  if (await webDevServerIsReachable()) {
    return {
      url: WEB_DEV_SERVER_URL,
      child: null,
    };
  }

  writeLine(colorize("Starting separate web frontend on 4173...", ANSI.dim));
  const child = startWebDevServer(session);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await webDevServerIsReachable()) {
      return {
        url: WEB_DEV_SERVER_URL,
        child,
      };
    }

    const maybeExitCode = await Promise.race([
      child.exited,
      wait(100).then(() => null),
    ]);
    if (maybeExitCode !== null) {
      throw new Error(`Web frontend exited before becoming ready (exit ${maybeExitCode})`);
    }
  }

  child.kill();
  throw new Error(`Web frontend did not become ready at ${WEB_DEV_SERVER_URL}`);
};

const launchWeb = async (session: RuntimeSession): Promise<void> => {
  const web = await ensureWebDevServer(session);
  const browserUrl = new URL(web.url);
  browserUrl.searchParams.set("sessionStartedAt", String(Date.now()));

  const opened = await openBrowser(browserUrl.toString());
  writeLine();
  if (opened) {
    writeLine(`${colorize("Opened browser dashboard:", ANSI.green, ANSI.bold)} ${browserUrl.toString()}`);
  } else {
    writeErrorLine(`${colorize("Could not open a browser automatically.", ANSI.red, ANSI.bold)} Open ${browserUrl.toString()} manually.`);
  }

  if (session.startedByLauncher && web.child) {
    writeLine(colorize("Press Ctrl+C to stop the local runtime and frontend dev server.", ANSI.dim));
  } else if (session.startedByLauncher) {
    writeLine(colorize("Press Ctrl+C to stop the local runtime.", ANSI.dim));
  } else if (web.child) {
    writeLine(colorize("Press Ctrl+C to stop the frontend dev server. The connected runtime will keep running.", ANSI.dim));
  } else {
    writeLine(colorize("Press Ctrl+C to close the launcher. The connected runtime and frontend will keep running.", ANSI.dim));
  }

  await waitForShutdownSignal(() => {
    if (web.child) {
      web.child.kill();
    }
  });
  process.exit(0);
};

const startLauncher = async (): Promise<void> => {
  writeLine(colorize("Starting CLOG...", ANSI.bold, ANSI.cyan));
  writeLine();

  const session = await ensureRuntime();
  printWelcomeScreen(session);

  const choice = await requestChoice();
  if (choice === "quit") {
    writeLine("Exiting.");
    process.exit(0);
    return;
  }

  if (choice === "web") {
    await launchWeb(session);
    return;
  }

  await startTuiFrontend();
};

if (import.meta.main) {
  await startLauncher();
}
