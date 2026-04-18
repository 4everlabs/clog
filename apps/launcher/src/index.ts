#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { createInterface, emitKeypressEvents } from "node:readline";
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

type FrontendChoice = "tui" | "web" | "settings" | "quit";
type SettingsChoice = "model" | "back";

interface RuntimeSession {
  readonly baseUrl: string;
  readonly startedByLauncher: boolean;
}

interface LauncherAiSettings {
  readonly provider: "openrouter" | "openai" | "none";
  readonly providerLabel: string;
  readonly model: string;
  readonly modelEnvKey: "OPENROUTER_MODEL" | "OPENAI_MODEL";
}

interface LauncherScreenState {
  readonly runtimeBaseUrl: string;
  readonly runtimeReachable: boolean;
  readonly ai: LauncherAiSettings;
}

interface Keypress {
  readonly name?: string;
  readonly sequence?: string;
  readonly ctrl?: boolean;
}

const WEB_FRONTEND_DIRECTORY = fileURLToPath(new URL("../../frontends/web/", import.meta.url));
const REPO_ENV_FILE = fileURLToPath(new URL("../../../.env", import.meta.url));
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

const clearScreen = (): void => {
  process.stdout.write("\u001Bc");
};

const wait = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const readOptionalEnvString = (key: string): string | null => {
  const value = process.env[key]?.trim();
  return value ? value : null;
};

export const resolveLauncherAiSettings = (): LauncherAiSettings => {
  const openRouterApiKey = readOptionalEnvString("OPENROUTER_API_KEY");
  const openAiApiKey = readOptionalEnvString("OPENAI_API_KEY");

  if (openRouterApiKey) {
    return {
      provider: "openrouter",
      providerLabel: "OpenRouter",
      model: readOptionalEnvString("OPENROUTER_MODEL") ?? "stepfun/step-3.5-flash",
      modelEnvKey: "OPENROUTER_MODEL",
    };
  }

  if (openAiApiKey) {
    return {
      provider: "openai",
      providerLabel: "OpenAI",
      model: readOptionalEnvString("OPENAI_MODEL") ?? readOptionalEnvString("OPENROUTER_MODEL") ?? "gpt-4o-mini",
      modelEnvKey: "OPENAI_MODEL",
    };
  }

  return {
    provider: "none",
    providerLabel: "No provider configured",
    model: readOptionalEnvString("OPENROUTER_MODEL") ?? "stepfun/step-3.5-flash",
    modelEnvKey: "OPENROUTER_MODEL",
  };
};

const quoteEnvValue = (value: string): string => {
  return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
};

export const upsertEnvVariable = (content: string, key: string, value: string): string => {
  const serializedLine = `${key}=${quoteEnvValue(value)}`;
  const linePattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=.*$`, "m");
  if (linePattern.test(content)) {
    return content.replace(linePattern, serializedLine);
  }

  const trimmedContent = content.trimEnd();
  return trimmedContent ? `${trimmedContent}\n\n${serializedLine}\n` : `${serializedLine}\n`;
};

const persistAiModelSelection = (settings: LauncherAiSettings, model: string): void => {
  let content = "";
  try {
    content = readFileSync(REPO_ENV_FILE, "utf-8");
  } catch {
    content = "";
  }

  writeFileSync(REPO_ENV_FILE, upsertEnvVariable(content, settings.modelEnvKey, model), "utf-8");
  process.env[settings.modelEnvKey] = model;
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

const printWelcomeScreen = (state: LauncherScreenState): void => {
  clearScreen();
  writeLine(runtimeBanner());
  writeLine();
  writeLine(colorize("WELCOME TO CLOG", ANSI.bold, ANSI.white));
  writeLine(colorize("Runtime-first oversight agent", ANSI.dim, ANSI.white));
  writeLine();
  writeLine(
    `${colorize("Runtime:", ANSI.bold)} ${state.runtimeReachable ? colorize("connected", ANSI.green) : colorize("starts on launch", ANSI.yellow)} ${colorize(state.runtimeBaseUrl, ANSI.dim)}`,
  );
  writeLine(`${colorize("Model:", ANSI.bold)} ${colorize(state.ai.model, ANSI.dim)} ${colorize(`(${state.ai.providerLabel})`, ANSI.dim)}`);
  writeLine();
  writeLine(colorize("Choose frontend:", ANSI.bold, ANSI.yellow));
  writeLine(`  ${colorize("[1]", ANSI.bgBlue, ANSI.white, ANSI.bold)} ${colorize("TUI", ANSI.bold)}  Full terminal interface`);
  writeLine(`  ${colorize("[2]", ANSI.bgBlue, ANSI.white, ANSI.bold)} ${colorize("Web", ANSI.bold)}  Start browser UI with hot reload`);
  writeLine(`  ${colorize("[s]", ANSI.bgBlue, ANSI.white, ANSI.bold)} ${colorize("System settings", ANSI.bold)}  Model and launcher-level config`);
  writeLine(`  ${colorize("[q]", ANSI.bgBlue, ANSI.white, ANSI.bold)} ${colorize("Quit", ANSI.bold)} Exit`);
  writeLine();
};

const requestChoice = async (): Promise<FrontendChoice> => {
  writeLine(colorize("Press 1 for TUI, 2 for Web, s for System settings, or q to quit.", ANSI.dim));
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

    const onKeypress = (_value: string, key: Keypress): void => {
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

      if (key.name === "s") {
        finish("settings");
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

const promptForLine = async (question: string): Promise<string> => {
  const stdin = process.stdin;
  const restoreRawMode = stdin.isTTY ? stdin.isRaw : false;
  if (stdin.isTTY) {
    stdin.setRawMode(false);
  }
  stdin.resume();

  return await new Promise<string>((resolve) => {
    const rl = createInterface({
      input: stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      if (stdin.isTTY) {
        stdin.setRawMode(restoreRawMode);
      }
      stdin.pause();
      resolve(answer.trim());
    });
  });
};

const waitForEnter = async (message = "Press Enter to continue."): Promise<void> => {
  await promptForLine(colorize(message, ANSI.dim));
};

const printSystemSettingsScreen = (settings: LauncherAiSettings): void => {
  clearScreen();
  writeLine(runtimeBanner());
  writeLine();
  writeLine(colorize("SYSTEM SETTINGS", ANSI.bold, ANSI.white));
  writeLine(colorize("High-level launcher and runtime defaults", ANSI.dim, ANSI.white));
  writeLine();
  writeLine(`${colorize("Provider:", ANSI.bold)} ${settings.provider === "none" ? colorize(settings.providerLabel, ANSI.yellow) : colorize(settings.providerLabel, ANSI.green)}`);
  writeLine(`${colorize("Model:", ANSI.bold)} ${colorize(settings.model, ANSI.dim)}`);
  writeLine(`${colorize("Env key:", ANSI.bold)} ${colorize(settings.modelEnvKey, ANSI.dim)}`);
  writeLine();
  writeLine(`  ${colorize("[m]", ANSI.bgBlue, ANSI.white, ANSI.bold)} ${colorize("Change model", ANSI.bold)}  Update the active provider model`);
  writeLine(`  ${colorize("[b]", ANSI.bgBlue, ANSI.white, ANSI.bold)} ${colorize("Back", ANSI.bold)} Return to launcher`);
  writeLine();
};

const requestSettingsChoice = async (): Promise<SettingsChoice> => {
  writeLine(colorize("Press m to change the model, or b to go back.", ANSI.dim));
  writeLine();

  return await new Promise<SettingsChoice>((resolve) => {
    const stdin = process.stdin;
    const restoreRawMode = stdin.isTTY ? stdin.isRaw : false;

    const cleanup = (): void => {
      stdin.off("keypress", onKeypress);
      if (stdin.isTTY) {
        stdin.setRawMode(restoreRawMode);
      }
      stdin.pause();
    };

    const finish = (choice: SettingsChoice): void => {
      cleanup();
      writeLine();
      resolve(choice);
    };

    const onKeypress = (_value: string, key: Keypress): void => {
      if (key.ctrl && key.name === "c") {
        finish("back");
        return;
      }

      if (key.name === "m") {
        finish("model");
        return;
      }

      if (key.name === "b" || key.name === "q" || key.name === "escape") {
        finish("back");
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

const openSystemSettings = async (): Promise<void> => {
  while (true) {
    const settings = resolveLauncherAiSettings();
    printSystemSettingsScreen(settings);

    const choice = await requestSettingsChoice();
    if (choice === "back") {
      return;
    }

    const nextModel = await promptForLine(
      `${colorize(`Enter a new model for ${settings.providerLabel}`, ANSI.bold)} ${colorize(`(${settings.modelEnvKey})`, ANSI.dim)}: `,
    );
    if (!nextModel) {
      writeLine(colorize("Model unchanged.", ANSI.yellow));
      await waitForEnter();
      continue;
    }

    persistAiModelSelection(settings, nextModel);
    writeLine(colorize(`Saved ${settings.modelEnvKey}=${nextModel}`, ANSI.green, ANSI.bold));
    await waitForEnter();
  }
};

const getLauncherScreenState = async (): Promise<LauncherScreenState> => {
  const runtimeBaseUrl = resolveBackendBaseUrl(process.env);
  return {
    runtimeBaseUrl,
    runtimeReachable: await runtimeIsReachable(runtimeBaseUrl),
    ai: resolveLauncherAiSettings(),
  };
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

  while (true) {
    const screenState = await getLauncherScreenState();
    printWelcomeScreen(screenState);

    const choice = await requestChoice();
    if (choice === "quit") {
      writeLine("Exiting.");
      process.exit(0);
      return;
    }

    if (choice === "settings") {
      await openSystemSettings();
      continue;
    }

    const session = await ensureRuntime();
    if (choice === "web") {
      await launchWeb(session);
      return;
    }

    await startTuiFrontend();
    return;
  }
};

if (import.meta.main) {
  await startLauncher();
}
