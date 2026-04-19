#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface, emitKeypressEvents } from "node:readline";
import { fileURLToPath } from "node:url";
import type { AgentExecutionMode, SurfaceChannelKind } from "@clog/types";
import { startDefaultRuntimeServer } from "../../clog/src/index.ts";
import {
  DEFAULT_CLOG_MODEL,
  DEFAULT_MONITOR_INTERVAL_MS,
  DEFAULT_RUNTIME_PORT,
  getModelChoices,
  RuntimeSettingsSchema,
  type RuntimeSettings,
} from "../../clog/src/runtime/config/settings";
import { resolveBackendBaseUrl } from "../../frontends/tui/src/clog-api";
import { startTuiFrontend } from "../../frontends/tui/src/index.ts";
import { syncRuntimeInstanceTemplate } from "../../../tests/runtime-instance-template";

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
type SettingsChoice = "model" | "instance" | "back";
type InstanceSelectionKind = "select" | "create";

interface RuntimeSession {
  readonly baseUrl: string;
  readonly startedByLauncher: boolean;
}

interface LauncherAiSettings {
  readonly model: string;
  readonly modelChoices: readonly string[];
}

interface LauncherRuntimeSettingsState {
  readonly instanceId: string;
  readonly settingsPath: string;
  readonly settings: RuntimeSettings | null;
}

interface LauncherRuntimeSettingsSummary {
  readonly instanceId: string;
  readonly settingsPath: string;
  readonly appName: string;
  readonly executionMode: AgentExecutionMode;
  readonly channels: readonly SurfaceChannelKind[];
  readonly monitorIntervalMs: number;
  readonly posthogHost: string;
  readonly posthogContext: string | null;
  readonly notionTodoTitle: string;
  readonly notionTodoPageUrl: string | null;
  readonly notionRequestTimeoutMs: number;
  readonly telegramUserName: string | null;
  readonly allowedChatIdsCount: number;
}

interface LauncherScreenState {
  readonly runtimeBaseUrl: string;
  readonly runtimeReachable: boolean;
  readonly ai: LauncherAiSettings;
  readonly settings: LauncherRuntimeSettingsSummary;
}

interface Keypress {
  readonly name?: string;
  readonly sequence?: string;
  readonly ctrl?: boolean;
}

interface InstanceSelectionOption {
  readonly kind: InstanceSelectionKind;
  readonly label: string;
  readonly marker: string;
  readonly shortcut: string | null;
  readonly instanceId?: string;
}

const WEB_FRONTEND_DIRECTORY = fileURLToPath(new URL("../../frontends/web/", import.meta.url));
const WORKSPACE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const RUNTIME_INSTANCES_DIRECTORY = fileURLToPath(new URL("../../../.runtime/instances/", import.meta.url));
const STARTER_INSTANCE_ID = "00";
const DEFAULT_INSTANCE_ID = STARTER_INSTANCE_ID;
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

const getLauncherProcessEnv = (): NodeJS.ProcessEnv => {
  if (typeof Bun === "undefined") {
    return process.env;
  }

  return {
    ...Bun.env,
    ...process.env,
  };
};

const readOptionalEnvString = (key: string): string | null => {
  const value = getLauncherProcessEnv()[key]?.trim();
  return value ? value : null;
};

const resolveSelectedInstanceId = (): string => {
  return readOptionalEnvString("CLOG_INSTANCE_ID") ?? DEFAULT_INSTANCE_ID;
};

const isNumericInstanceId = (value: string): boolean => /^\d{2}$/u.test(value);

export const compareRuntimeInstanceIds = (left: string, right: string): number => {
  const leftNumeric = isNumericInstanceId(left);
  const rightNumeric = isNumericInstanceId(right);
  if (leftNumeric && rightNumeric) {
    return Number.parseInt(left, 10) - Number.parseInt(right, 10);
  }

  if (leftNumeric) {
    return -1;
  }

  if (rightNumeric) {
    return 1;
  }

  return left.localeCompare(right);
};

export const getNextSequentialInstanceId = (instanceIds: readonly string[]): string => {
  const numericIds = instanceIds
    .filter((instanceId) => isNumericInstanceId(instanceId))
    .map((instanceId) => Number.parseInt(instanceId, 10));
  const nextValue = numericIds.length > 0
    ? Math.max(...numericIds) + 1
    : 0;
  if (nextValue > 99) {
    throw new Error("No two-digit runtime instance ids remain.");
  }
  return String(nextValue).padStart(2, "0");
};

export const getInstanceShortcutLabel = (instanceId: string): string | null => {
  return isNumericInstanceId(instanceId) ? String(Number.parseInt(instanceId, 10)) : null;
};

const createNextSequentialInstance = (instanceIds: readonly string[]): string => {
  const instanceId = getNextSequentialInstanceId(instanceIds);
  syncRuntimeInstanceTemplate(
    {
      ...getLauncherProcessEnv(),
      CLOG_INSTANCE_ID: instanceId,
    },
    WORKSPACE_ROOT,
  );
  return instanceId;
};

const resolveRuntimeInstanceRoot = (instanceId: string): string => {
  return join(RUNTIME_INSTANCES_DIRECTORY, instanceId);
};

const resolveRuntimeSettingsPath = (instanceId: string): string => {
  return join(resolveRuntimeInstanceRoot(instanceId), "read-only", "settings.json");
};

const readRuntimeSettingsFile = (settingsPath: string): RuntimeSettings | null => {
  if (!existsSync(settingsPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf-8")) as unknown;
    const validated = RuntimeSettingsSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
};

const loadLauncherRuntimeSettingsState = (instanceId = resolveSelectedInstanceId()): LauncherRuntimeSettingsState => {
  const settingsPath = resolveRuntimeSettingsPath(instanceId);
  return {
    instanceId,
    settingsPath,
    settings: readRuntimeSettingsFile(settingsPath),
  };
};

export const resolveLauncherAiSettings = (instanceId = resolveSelectedInstanceId()): LauncherAiSettings => {
  const instance = loadLauncherRuntimeSettingsState(instanceId);

  return {
    model: readOptionalEnvString("CLOG_MODEL") || instance.settings?.ai?.model?.trim() || DEFAULT_CLOG_MODEL,
    modelChoices: getModelChoices(instance.settings),
  };
};

const writeRuntimeSettingsFile = (instanceId: string, settings: RuntimeSettings): void => {
  const settingsPath = resolveRuntimeSettingsPath(instanceId);
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
};

const persistAiModelSelection = (instanceId: string, model: string): void => {
  const trimmedModel = model.trim();
  if (!trimmedModel) {
    return;
  }

  const current = loadLauncherRuntimeSettingsState(instanceId).settings;
  const validated = RuntimeSettingsSchema.parse({
    ...current,
    ai: {
      ...current?.ai,
      model: trimmedModel,
      modelChoices: Array.from(new Set([trimmedModel, ...getModelChoices(current)])),
    },
  });

  writeRuntimeSettingsFile(instanceId, validated);
  process.env.CLOG_INSTANCE_ID = instanceId;
  process.env.CLOG_MODEL = trimmedModel;
};

const resolveLauncherRuntimeSettingsSummary = (
  instance: LauncherRuntimeSettingsState,
): LauncherRuntimeSettingsSummary => {
  const settings = instance.settings;
  const executionMode: AgentExecutionMode = settings?.runtime?.executionMode ?? "propose";
  const channels: SurfaceChannelKind[] = [...(settings?.runtime?.channels ?? ["tui"])];

  return {
    instanceId: instance.instanceId,
    settingsPath: instance.settingsPath,
    appName: settings?.app?.name?.trim() || "Clog",
    executionMode,
    channels,
    monitorIntervalMs: settings?.monitor?.intervalMs ?? DEFAULT_MONITOR_INTERVAL_MS,
    posthogHost: settings?.posthog?.host?.trim() || "https://us.posthog.com",
    posthogContext: settings?.posthog?.context?.trim() || null,
    notionTodoTitle: settings?.notion?.todoSearchTitle?.trim() || "Pre Beta To Do",
    notionTodoPageUrl: settings?.notion?.todoPageUrl?.trim() || null,
    notionRequestTimeoutMs: settings?.notion?.requestTimeoutMs ?? 30_000,
    telegramUserName: settings?.telegram?.userName?.trim()?.replace(/^@/u, "") ?? null,
    allowedChatIdsCount: settings?.telegram?.allowedChatIds?.length ?? 0,
  };
};

const syncProcessEnvWithInstanceSettings = (instanceId = resolveSelectedInstanceId()): void => {
  const instance = loadLauncherRuntimeSettingsState(instanceId);
  process.env.CLOG_INSTANCE_ID = instanceId;
  process.env.PORT = String(instance.settings?.runtime?.port ?? DEFAULT_RUNTIME_PORT);
};

const listRuntimeInstances = (): string[] => {
  try {
    const entries = readdirSync(RUNTIME_INSTANCES_DIRECTORY, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(compareRuntimeInstanceIds);
    return entries.length > 0 ? entries : [DEFAULT_INSTANCE_ID];
  } catch {
    return [DEFAULT_INSTANCE_ID];
  }
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
  writeLine(`${colorize("Instance:", ANSI.bold)} ${colorize(state.settings.instanceId, ANSI.dim)}`);
  writeLine(
    `${colorize("Runtime:", ANSI.bold)} ${state.runtimeReachable ? colorize("connected", ANSI.green) : colorize("starts on launch", ANSI.yellow)} ${colorize(state.runtimeBaseUrl, ANSI.dim)}`,
  );
  writeLine(`${colorize("Clog model:", ANSI.bold)} ${colorize(state.ai.model, ANSI.dim)}`);
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

const buildInstanceSelectionOptions = (
  instances: readonly string[],
  currentInstanceId: string,
): InstanceSelectionOption[] => {
  return [
    ...instances.map((instanceId) => ({
      kind: "select" as const,
      label: instanceId,
      marker: instanceId === currentInstanceId ? "current" : "available",
      shortcut: getInstanceShortcutLabel(instanceId),
      instanceId,
    })),
    {
      kind: "create" as const,
      label: "Create new",
      marker: "next instance",
      shortcut: "n",
    },
  ];
};

const printInstanceSelectionScreen = (
  options: readonly InstanceSelectionOption[],
  selectedIndex: number,
): void => {
  clearScreen();
  writeLine(runtimeBanner());
  writeLine();
  writeLine(colorize("CHOOSE INSTANCE", ANSI.bold, ANSI.white));
  writeLine(colorize("What instance would you like to go to?", ANSI.dim, ANSI.white));
  writeLine();

  options.forEach((option, index) => {
    const badge = option.shortcut ? `[${option.shortcut}]` : "[ ]";
    if (index === selectedIndex) {
      writeLine(colorize(`> ${badge} ${option.label} ${option.marker}`, ANSI.bgBlue, ANSI.white, ANSI.bold));
      return;
    }

    const marker = option.marker === "current"
      ? colorize(option.marker, ANSI.green)
      : colorize(option.marker, ANSI.dim);
    writeLine(`  ${colorize(badge, ANSI.bgBlue, ANSI.white, ANSI.bold)} ${colorize(option.label, ANSI.bold)} ${marker}`);
  });

  writeLine();
  writeLine(colorize("Use Up/Down and Enter. Press a number for numeric instances, or n for Create new.", ANSI.dim));
  writeLine();
};

const resolveInstanceSelection = (
  option: InstanceSelectionOption,
  instances: readonly string[],
): string => {
  if (option.kind === "create") {
    const createdInstanceId = createNextSequentialInstance(instances);
    process.env.CLOG_INSTANCE_ID = createdInstanceId;
    return createdInstanceId;
  }

  const selected = option.instanceId ?? DEFAULT_INSTANCE_ID;
  process.env.CLOG_INSTANCE_ID = selected;
  return selected;
};

const chooseRuntimeInstance = async (): Promise<string> => {
  while (true) {
    const instances = listRuntimeInstances();
    const currentInstanceId = readOptionalEnvString("CLOG_INSTANCE_ID") ?? instances[0] ?? DEFAULT_INSTANCE_ID;
    const options = buildInstanceSelectionOptions(instances, currentInstanceId);
    const initialIndex = Math.max(0, options.findIndex((option) => option.instanceId === currentInstanceId));

    return await new Promise<string>((resolve) => {
      const stdin = process.stdin;
      const restoreRawMode = stdin.isTTY ? stdin.isRaw : false;
      let selectedIndex = initialIndex;

      const render = (): void => {
        printInstanceSelectionScreen(options, selectedIndex);
      };

      const cleanup = (): void => {
        stdin.off("keypress", onKeypress);
        if (stdin.isTTY) {
          stdin.setRawMode(restoreRawMode);
        }
        stdin.pause();
      };

      const finish = (instanceId: string): void => {
        cleanup();
        writeLine();
        resolve(instanceId);
      };

      const moveSelection = (delta: number): void => {
        selectedIndex = (selectedIndex + delta + options.length) % options.length;
        render();
      };

      const selectShortcut = (shortcut: string): boolean => {
        const shortcutIndex = options.findIndex((option) => option.shortcut === shortcut);
        if (shortcutIndex < 0) {
          return false;
        }
        selectedIndex = shortcutIndex;
        render();
        finish(resolveInstanceSelection(options[shortcutIndex]!, instances));
        return true;
      };

      const onKeypress = (_value: string, key: Keypress): void => {
        if (key.ctrl && key.name === "c") {
          cleanup();
          process.exit(0);
          return;
        }

        if (key.name === "up" || key.name === "k") {
          moveSelection(-1);
          return;
        }

        if (key.name === "down" || key.name === "j") {
          moveSelection(1);
          return;
        }

        if (key.name === "return" || key.name === "enter") {
          finish(resolveInstanceSelection(options[selectedIndex]!, instances));
          return;
        }

        if (key.name === "n") {
          void selectShortcut("n");
          return;
        }

        if (key.sequence && /^[0-9]$/u.test(key.sequence)) {
          void selectShortcut(key.sequence);
        }
      };

      emitKeypressEvents(stdin);
      if (stdin.isTTY) {
        stdin.setRawMode(true);
      }
      stdin.resume();
      render();
      stdin.on("keypress", onKeypress);
    });
  }
};

const chooseModelFromList = async (
  instanceId: string,
  settings: LauncherAiSettings,
): Promise<string | null> => {
  clearScreen();
  writeLine(runtimeBanner());
  writeLine();
  writeLine(colorize("MODEL SETTINGS", ANSI.bold, ANSI.white));
  writeLine(colorize(`Instance: ${instanceId}`, ANSI.dim, ANSI.white));
  writeLine();

  settings.modelChoices.forEach((model, index) => {
    const marker = model === settings.model ? colorize("current", ANSI.green) : colorize("preset", ANSI.dim);
    writeLine(`  ${colorize(`[${index + 1}]`, ANSI.bgBlue, ANSI.white, ANSI.bold)} ${colorize(model, ANSI.bold)} ${marker}`);
  });

  writeLine(`  ${colorize("[c]", ANSI.bgBlue, ANSI.white, ANSI.bold)} ${colorize("Custom model id", ANSI.bold)}`);
  writeLine(`  ${colorize("[b]", ANSI.bgBlue, ANSI.white, ANSI.bold)} ${colorize("Back", ANSI.bold)}`);
  writeLine();

  const answer = await promptForLine(colorize("Choose a model: ", ANSI.bold));
  const trimmed = answer.trim();

  if (!trimmed || trimmed === "b") {
    return null;
  }

  if (trimmed === "c") {
    const customModel = await promptForLine(
      `${colorize("Enter a Clog model id", ANSI.bold)} ${colorize("(CLOG_MODEL)", ANSI.dim)}: `,
    );
    return customModel.trim() || null;
  }

  const numericChoice = Number.parseInt(trimmed, 10);
  if (Number.isInteger(numericChoice) && numericChoice >= 1 && numericChoice <= settings.modelChoices.length) {
    return settings.modelChoices[numericChoice - 1] ?? null;
  }

  writeLine(colorize(`Unknown model selection "${trimmed}".`, ANSI.red, ANSI.bold));
  await waitForEnter();
  return null;
};

const printSystemSettingsScreen = (state: LauncherScreenState): void => {
  clearScreen();
  writeLine(runtimeBanner());
  writeLine();
  writeLine(colorize("SYSTEM SETTINGS", ANSI.bold, ANSI.white));
  writeLine(colorize("Per-instance launcher and runtime defaults", ANSI.dim, ANSI.white));
  writeLine();
  writeLine(`${colorize("Instance:", ANSI.bold)} ${colorize(state.settings.instanceId, ANSI.dim)}`);
  writeLine(`${colorize("Settings file:", ANSI.bold)} ${colorize(state.settings.settingsPath, ANSI.dim)}`);
  writeLine(`${colorize("App name:", ANSI.bold)} ${colorize(state.settings.appName, ANSI.dim)}`);
  writeLine(`${colorize("Execution mode:", ANSI.bold)} ${colorize(state.settings.executionMode, ANSI.dim)}`);
  writeLine(`${colorize("Channels:", ANSI.bold)} ${colorize(state.settings.channels.join(", "), ANSI.dim)}`);
  writeLine(`${colorize("Monitor interval:", ANSI.bold)} ${colorize(`${state.settings.monitorIntervalMs} ms`, ANSI.dim)}`);
  writeLine(`${colorize("Clog model:", ANSI.bold)} ${colorize(state.ai.model, ANSI.dim)}`);
  writeLine(`${colorize("PostHog host:", ANSI.bold)} ${colorize(state.settings.posthogHost, ANSI.dim)}`);
  writeLine(`${colorize("PostHog context:", ANSI.bold)} ${colorize(state.settings.posthogContext ?? "not set", ANSI.dim)}`);
  writeLine(`${colorize("Notion todo title:", ANSI.bold)} ${colorize(state.settings.notionTodoTitle, ANSI.dim)}`);
  writeLine(`${colorize("Notion request timeout:", ANSI.bold)} ${colorize(`${state.settings.notionRequestTimeoutMs} ms`, ANSI.dim)}`);
  writeLine(`${colorize("Notion todo page:", ANSI.bold)} ${colorize(state.settings.notionTodoPageUrl ?? "not set", ANSI.dim)}`);
  writeLine(`${colorize("Telegram username:", ANSI.bold)} ${colorize(state.settings.telegramUserName ?? "not set", ANSI.dim)}`);
  writeLine(`${colorize("Telegram allowed chats:", ANSI.bold)} ${colorize(String(state.settings.allowedChatIdsCount), ANSI.dim)}`);
  writeLine();
  writeLine(`  ${colorize("[i]", ANSI.bgBlue, ANSI.white, ANSI.bold)} ${colorize("Change instance", ANSI.bold)}  Switch runtime instance folder`);
  writeLine(`  ${colorize("[m]", ANSI.bgBlue, ANSI.white, ANSI.bold)} ${colorize("Change Clog model", ANSI.bold)}  Update the selected model`);
  writeLine(`  ${colorize("[b]", ANSI.bgBlue, ANSI.white, ANSI.bold)} ${colorize("Back", ANSI.bold)} Return to launcher`);
  writeLine();
};

const requestSettingsChoice = async (): Promise<SettingsChoice> => {
  writeLine(colorize("Press i to change instance, m to change model, or b to go back.", ANSI.dim));
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

      if (key.name === "i") {
        finish("instance");
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
    const screenState = await getLauncherScreenState();
    printSystemSettingsScreen(screenState);

    const choice = await requestSettingsChoice();
    if (choice === "back") {
      return;
    }

    if (choice === "instance") {
      const nextInstanceId = await chooseRuntimeInstance();
      syncProcessEnvWithInstanceSettings(nextInstanceId);
      continue;
    }

    const nextModel = await chooseModelFromList(screenState.settings.instanceId, screenState.ai);
    if (!nextModel) {
      writeLine(colorize("Model unchanged.", ANSI.yellow));
      await waitForEnter();
      continue;
    }

    persistAiModelSelection(screenState.settings.instanceId, nextModel);
    writeLine(colorize(`Saved model ${nextModel} to ${screenState.settings.settingsPath}`, ANSI.green, ANSI.bold));
    await waitForEnter();
  }
};

const getLauncherScreenState = async (): Promise<LauncherScreenState> => {
  const instance = loadLauncherRuntimeSettingsState();
  const launcherEnv = getLauncherProcessEnv();
  const runtimeBaseUrl = resolveBackendBaseUrl({
    ...launcherEnv,
    PORT: String(instance.settings?.runtime?.port ?? launcherEnv.PORT ?? DEFAULT_RUNTIME_PORT),
  });
  return {
    runtimeBaseUrl,
    runtimeReachable: await runtimeIsReachable(runtimeBaseUrl),
    ai: resolveLauncherAiSettings(instance.instanceId),
    settings: resolveLauncherRuntimeSettingsSummary(instance),
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
  const requestedBaseUrl = resolveBackendBaseUrl(getLauncherProcessEnv());
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
  const launcherEnv = getLauncherProcessEnv();
  return Bun.spawn({
    cmd: ["bun", "--bun", "vite", "--host", "127.0.0.1", "--port", "4173"],
    cwd: WEB_FRONTEND_DIRECTORY,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
    env: {
      ...launcherEnv,
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
  const instanceId = await chooseRuntimeInstance();
  syncProcessEnvWithInstanceSettings(instanceId);

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
