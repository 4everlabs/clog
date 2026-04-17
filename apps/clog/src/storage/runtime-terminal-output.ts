export type RuntimeTerminalStreamName = "stdout" | "stderr";

interface StreamState {
  buffered: string;
  suppressingBlock: boolean;
}

interface StartupReplacement {
  readonly text: string;
  readonly suppressBlock?: boolean;
}

const DEFAULT_STARTUP_WINDOW_MS = 15_000;

export class RuntimeTerminalOutputFormatter {
  private readonly emittedSummaries = new Set<string>();
  private readonly streamStates: Record<RuntimeTerminalStreamName, StreamState> = {
    stdout: {
      buffered: "",
      suppressingBlock: false,
    },
    stderr: {
      buffered: "",
      suppressingBlock: false,
    },
  };

  constructor(
    private readonly startedAt = Date.now(),
    private readonly startupWindowMs = DEFAULT_STARTUP_WINDOW_MS,
  ) {}

  formatChunk(
    streamName: RuntimeTerminalStreamName,
    chunk: string | Uint8Array,
    now = Date.now(),
  ): string {
    const state = this.streamStates[streamName];
    state.buffered += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");

    let rendered = "";
    while (true) {
      const newlineIndex = state.buffered.indexOf("\n");
      if (newlineIndex === -1) {
        return rendered;
      }

      const line = state.buffered.slice(0, newlineIndex);
      state.buffered = state.buffered.slice(newlineIndex + 1);
      rendered += this.renderLine(state, line, "\n", now);
    }
  }

  flush(streamName: RuntimeTerminalStreamName, now = Date.now()): string {
    const state = this.streamStates[streamName];
    if (state.buffered.length === 0) {
      return "";
    }

    const remaining = state.buffered;
    state.buffered = "";
    return this.renderLine(state, remaining, "", now);
  }

  private renderLine(
    state: StreamState,
    line: string,
    lineEnding: string,
    now: number,
  ): string {
    if (!this.shouldHumanizeStartupOutput(now)) {
      return `${line}${lineEnding}`;
    }

    const trimmed = line.trim();
    if (state.suppressingBlock) {
      if (trimmed === "}") {
        state.suppressingBlock = false;
      }
      return "";
    }

    const replacement = this.getStartupReplacement(line);
    if (!replacement) {
      return `${line}${lineEnding}`;
    }

    if (replacement.suppressBlock) {
      state.suppressingBlock = true;
    }

    return replacement.text.length > 0 ? `${replacement.text}${lineEnding}` : "";
  }

  private shouldHumanizeStartupOutput(now: number): boolean {
    return now - this.startedAt <= this.startupWindowMs;
  }

  private getStartupReplacement(line: string): StartupReplacement | null {
    if (line.startsWith("[chat-sdk:telegram] Telegram adapter initialized {")) {
      return {
        text: this.emitOnce("telegram-connecting", "Startup: Connecting Telegram"),
        suppressBlock: true,
      };
    }

    if (line.startsWith("[chat-sdk:telegram] Telegram webhook reset {")) {
      return {
        text: this.emitOnce("telegram-webhook-reset", "Startup: Resetting Telegram webhook"),
        suppressBlock: true,
      };
    }

    if (line.startsWith("[chat-sdk:telegram] Telegram polling started {")) {
      return {
        text: this.emitOnce("telegram-polling", "Startup: Starting Telegram polling"),
        suppressBlock: true,
      };
    }

    if (line.startsWith("[chat-sdk] Chat instance initialized {")) {
      return {
        text: this.emitOnce("chat-instance-ready", "Startup: Chat instance ready"),
        suppressBlock: true,
      };
    }

    if (line.startsWith("[telegram] Chat SDK initialized in ")) {
      return {
        text: this.emitOnce("telegram-ready", "Startup: Telegram ready"),
      };
    }

    if (line.startsWith("[posthog-mcp] initialized ")) {
      return {
        text: this.emitOnce("posthog-mcp-ready", "Startup: PostHog MCP ready"),
      };
    }

    if (line.startsWith("[posthog-performance] wrote report ")) {
      return {
        text: this.emitOnce("posthog-performance-report", "Startup: Saved PostHog performance snapshot"),
      };
    }

    return null;
  }

  private emitOnce(key: string, text: string): string {
    if (this.emittedSummaries.has(key)) {
      return "";
    }

    this.emittedSummaries.add(key);
    return text;
  }
}
