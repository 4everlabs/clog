#!/usr/bin/env bun

import { existsSync } from "node:fs";
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
const WEB_FRONTEND_ENTRY = fileURLToPath(new URL("../../frontends/web/dist/index.html", import.meta.url));

const clearScreen = (): void => {
  process.stdout.write("\u001Bc");
};

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
  clearScreen();
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
  writeLine(`  ${colorize("[2]", ANSI.bgBlue, ANSI.white, ANSI.bold)} ${colorize("Web", ANSI.bold)}  Open the browser target`);
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

const waitForShutdownSignal = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    const handle = (): void => {
      process.off("SIGINT", handle);
      process.off("SIGTERM", handle);
      resolve();
    };

    process.on("SIGINT", handle);
    process.on("SIGTERM", handle);
  });
};

const ensureWebDashboardBuilt = async (): Promise<void> => {
  if (existsSync(WEB_FRONTEND_ENTRY)) {
    return;
  }

  writeLine(colorize("Building Svelte dashboard...", ANSI.dim));
  const child = Bun.spawn({
    cmd: ["bun", "run", "build"],
    cwd: WEB_FRONTEND_DIRECTORY,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error("Web dashboard build failed");
  }
};

const launchWeb = async (session: RuntimeSession): Promise<void> => {
  await ensureWebDashboardBuilt();
  const opened = await openBrowser(session.baseUrl);
  writeLine();
  if (opened) {
    writeLine(`${colorize("Opened browser dashboard:", ANSI.green, ANSI.bold)} ${session.baseUrl}`);
  } else {
    writeErrorLine(`${colorize("Could not open a browser automatically.", ANSI.red, ANSI.bold)} Open ${session.baseUrl} manually.`);
  }

  if (session.startedByLauncher) {
    writeLine(colorize("Press Ctrl+C to stop the local runtime.", ANSI.dim));
    await waitForShutdownSignal();
    process.exit(0);
  }
};

const startLauncher = async (): Promise<void> => {
  clearScreen();
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
