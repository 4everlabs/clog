#!/usr/bin/env bun

import {
  ASCIIFontRenderable,
  BoxRenderable,
  CliRenderEvents,
  InputRenderable,
  InputRenderableEvents,
  TextRenderable,
  createCliRenderer,
} from "@opentui/core";
import type { AgentRuntimeSummary } from "@clog/types";
import { ClogApiClient } from "./clog-api";

export interface TuiOptions {
  client: ClogApiClient;
}

const BACKGROUND = "#040814";
const PANEL = "#0b1220";
const BORDER = "#1d4ed8";
const BORDER_FOCUSED = "#22d3ee";
const TEXT_PRIMARY = "#e2e8f0";
const TEXT_MUTED = "#94a3b8";
const TEXT_ACCENT = "#7dd3fc";
const TEXT_SUCCESS = "#34d399";

export class Tui {
  private readonly client: ClogApiClient;

  constructor(options: TuiOptions) {
    this.client = options.client;
  }

  async start(): Promise<void> {
    const runtime = await this.getRuntimeSummary();
    const renderer = await createCliRenderer({
      screenMode: "alternate-screen",
      exitOnCtrlC: true,
      autoFocus: true,
      externalOutputMode: "capture-stdout",
      backgroundColor: BACKGROUND,
    });

    renderer.setTerminalTitle("CLOG");

    const shell = new BoxRenderable(renderer, {
      id: "shell",
      width: "100%",
      height: "100%",
      backgroundColor: BACKGROUND,
      flexDirection: "column",
      justifyContent: "space-between",
      alignItems: "stretch",
      paddingX: 4,
      paddingY: 2,
    });

    const hero = new BoxRenderable(renderer, {
      id: "hero",
      flexGrow: 1,
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      gap: 1,
      backgroundColor: BACKGROUND,
    });

    const logo = new ASCIIFontRenderable(renderer, {
      id: "logo",
      text: "CLOG",
      font: "shade",
      color: ["#67e8f9", "#60a5fa", "#34d399"],
      backgroundColor: BACKGROUND,
    });

    const subtitle = new TextRenderable(renderer, {
      id: "subtitle",
      content: "Oversight terminal",
      fg: TEXT_PRIMARY,
      bg: BACKGROUND,
    });

    const runtimeStatus = new TextRenderable(renderer, {
      id: "runtime-status",
      content: this.getRuntimeStatusLine(runtime),
      fg: TEXT_MUTED,
      bg: BACKGROUND,
    });

    const footer = new BoxRenderable(renderer, {
      id: "footer",
      flexDirection: "column",
      alignItems: "center",
      gap: 1,
      backgroundColor: BACKGROUND,
      paddingBottom: 1,
    });

    const helper = new TextRenderable(renderer, {
      id: "helper",
      content: "Type into the prompt. Press Enter to capture it. Press Esc to quit.",
      fg: TEXT_MUTED,
      bg: BACKGROUND,
    });

    const promptFrame = new BoxRenderable(renderer, {
      id: "prompt-frame",
      width: "70%",
      minWidth: 36,
      maxWidth: 84,
      border: true,
      borderStyle: "single",
      borderColor: BORDER,
      focusedBorderColor: BORDER_FOCUSED,
      backgroundColor: PANEL,
      paddingX: 1,
      paddingY: 0,
      title: " clog ",
      titleAlignment: "center",
    });

    const prompt = new InputRenderable(renderer, {
      id: "prompt",
      width: "100%",
      value: "",
      placeholder: "clog >",
      placeholderColor: TEXT_MUTED,
      backgroundColor: PANEL,
      focusedBackgroundColor: PANEL,
      textColor: TEXT_PRIMARY,
      focusedTextColor: TEXT_ACCENT,
      maxLength: 500,
    });

    prompt.on(InputRenderableEvents.ENTER, (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        helper.content = "Type into the prompt. Press Enter to capture it. Press Esc to quit.";
        return;
      }

      helper.content = `Captured: ${trimmed}`;
      helper.fg = TEXT_SUCCESS;
      prompt.value = "";
    });

    renderer.keyInput.on("keypress", (key) => {
      if (key.name === "escape") {
        key.preventDefault();
        renderer.destroy();
        return;
      }

      if (key.ctrl && key.name === "c") {
        key.preventDefault();
        renderer.destroy();
      }
    });

    promptFrame.add(prompt);
    hero.add(logo);
    hero.add(subtitle);
    hero.add(runtimeStatus);
    footer.add(helper);
    footer.add(promptFrame);
    shell.add(hero);
    shell.add(footer);
    renderer.root.add(shell);

    prompt.focus();
    renderer.start();

    await new Promise<void>((resolve) => {
      renderer.once(CliRenderEvents.DESTROY, () => resolve());
    });
  }

  private async getRuntimeSummary(): Promise<AgentRuntimeSummary | null> {
    try {
      return await this.client.getRuntimeHealth();
    } catch {
      return null;
    }
  }

  private getRuntimeStatusLine(runtime: AgentRuntimeSummary | null): string {
    if (!runtime) {
      return "Runtime unavailable";
    }

    const integrations = runtime.activeIntegrations.length > 0
      ? runtime.activeIntegrations.join(", ")
      : "none";
    return `Runtime ${runtime.status} | mode ${runtime.executionMode} | integrations ${integrations}`;
  }
}

export const createTui = (client: ClogApiClient): Tui => {
  return new Tui({ client });
};

export const startTui = async (client: ClogApiClient): Promise<void> => {
  const tui = createTui(client);
  await tui.start();
};
