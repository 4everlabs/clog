import type { RuntimeWakeupConfig, RuntimeWakeupPromptDefinition } from "@clog/types";
import { sendTelegramOperatorNotifications } from "../../../frontends/telegram/src";
import type { RuntimeBootstrap } from "./bootstrap";
import { loadRuntimeWakeupConfig, parseRuntimeWakeupTimeUtc } from "./config/wakeup";

const DAY_MS = 86_400_000;
export const DEFAULT_WAKEUP_SCHEDULER_POLL_MS = 30_000;

export interface ResolvedWakeupRun {
  readonly promptId: string;
  readonly timeUtc: string | null;
  readonly prompt: RuntimeWakeupPromptDefinition;
  readonly scheduledForUtc: number | null;
  readonly occurrenceKey: string | null;
}

export interface WakeupExecutionHooks {
  readonly notifyTelegramReply?: (runtime: RuntimeBootstrap, markdown: string) => Promise<number>;
  readonly logInfo?: (value: string) => void;
  readonly logError?: (value: string) => void;
}

export interface DailyWakeupSchedulerOptions extends WakeupExecutionHooks {
  readonly runtime: RuntimeBootstrap;
  readonly env?: NodeJS.ProcessEnv;
  readonly workspaceRoot?: string;
  readonly pollIntervalMs?: number;
  readonly now?: () => number;
}

const describeWakeupRun = (run: ResolvedWakeupRun, mode: "startup" | "scheduled"): string => {
  if (mode === "startup") {
    return `startup wakeup ${run.promptId}`;
  }

  return run.timeUtc
    ? `scheduled wakeup ${run.promptId} @ ${run.timeUtc} UTC`
    : `scheduled wakeup ${run.promptId}`;
};

const getUtcDayStart = (value: number): number => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const getUtcDateKey = (value: number): string => new Date(value).toISOString().slice(0, 10);

export const resolveWakeupOccurrenceTimestamp = (dayStartUtcMs: number, timeUtc: string): number | null => {
  const parsed = parseRuntimeWakeupTimeUtc(timeUtc);
  if (!parsed) {
    return null;
  }

  return dayStartUtcMs + (parsed.hour * 60 + parsed.minute) * 60_000;
};

export const collectDueWakeupRuns = (
  config: RuntimeWakeupConfig,
  windowStartMs: number,
  windowEndMs: number,
): readonly ResolvedWakeupRun[] => {
  if (windowEndMs <= windowStartMs) {
    return [];
  }

  const firstDayStart = getUtcDayStart(windowStartMs);
  const lastDayStart = getUtcDayStart(windowEndMs);
  const runs: ResolvedWakeupRun[] = [];

  for (let dayStart = firstDayStart; dayStart <= lastDayStart; dayStart += DAY_MS) {
    const dateKey = getUtcDateKey(dayStart);
    for (const entry of config.schedule) {
      const prompt = config.prompts[entry.promptId];
      if (!prompt) {
        continue;
      }

      const scheduledForUtc = resolveWakeupOccurrenceTimestamp(dayStart, entry.timeUtc);
      if (scheduledForUtc === null || scheduledForUtc <= windowStartMs || scheduledForUtc > windowEndMs) {
        continue;
      }

      runs.push({
        promptId: entry.promptId,
        timeUtc: entry.timeUtc,
        prompt,
        scheduledForUtc,
        occurrenceKey: `${dateKey}:${entry.timeUtc}:${entry.promptId}`,
      });
    }
  }

  return runs.sort((left, right) => {
    if (left.scheduledForUtc !== right.scheduledForUtc) {
      return (left.scheduledForUtc ?? 0) - (right.scheduledForUtc ?? 0);
    }
    return left.promptId.localeCompare(right.promptId);
  });
};

export const resolveStartupWakeupRun = (config: RuntimeWakeupConfig): ResolvedWakeupRun | null => {
  if (!config.enabled) {
    return null;
  }

  const firstEntry = config.schedule[0];
  if (!firstEntry) {
    return null;
  }

  const prompt = config.prompts[firstEntry.promptId];
  if (!prompt) {
    return null;
  }

  return {
    promptId: firstEntry.promptId,
    timeUtc: firstEntry.timeUtc,
    prompt,
    scheduledForUtc: null,
    occurrenceKey: null,
  };
};

export const runResolvedWakeup = async (
  runtime: RuntimeBootstrap,
  run: ResolvedWakeupRun,
  mode: "startup" | "scheduled",
  hooks: WakeupExecutionHooks = {},
): Promise<void> => {
  const result = await runtime.gateway.runWakeupPass({
    message: run.prompt.prompt,
    title: run.prompt.title,
  });

  const notifyTelegramReply = hooks.notifyTelegramReply ?? sendTelegramOperatorNotifications;
  const telegramNotifications = runtime.env.capabilities.chat.canSendOperatorMessages
    ? await notifyTelegramReply(runtime, result.response.replyMessage.content)
    : 0;
  const runLabel = describeWakeupRun(run, mode);

  hooks.logInfo?.(
    `[clog] ${runLabel} checked ${result.monitorResult.integrationHealth.length} integrations and ${result.monitorResult.findings.length} findings`,
  );
  hooks.logInfo?.(
    `[clog] ${runLabel} reply: ${result.response.replyMessage.content.slice(0, 240)}`,
  );
  if (telegramNotifications > 0) {
    hooks.logInfo?.(
      `[clog] ${runLabel} sent ${telegramNotifications} Telegram notification${telegramNotifications === 1 ? "" : "s"}`,
    );
  }
};

export class DailyWakeupScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastTickAt: number | null = null;
  private readonly deliveredOccurrences = new Map<string, number>();

  constructor(private readonly options: DailyWakeupSchedulerOptions) {}

  start(): void {
    if (this.timer) {
      return;
    }

    const pollIntervalMs = this.options.pollIntervalMs ?? DEFAULT_WAKEUP_SCHEDULER_POLL_MS;
    const now = this.getNow();
    this.lastTickAt = now - pollIntervalMs;
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, pollIntervalMs);
    if (typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  private getNow(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  private pruneDeliveredOccurrences(now: number): void {
    const cutoff = getUtcDayStart(now) - DAY_MS;
    for (const [key, scheduledForUtc] of this.deliveredOccurrences.entries()) {
      if (scheduledForUtc < cutoff) {
        this.deliveredOccurrences.delete(key);
      }
    }
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    const now = this.getNow();
    const pollIntervalMs = this.options.pollIntervalMs ?? DEFAULT_WAKEUP_SCHEDULER_POLL_MS;
    const windowStartMs = this.lastTickAt ?? (now - pollIntervalMs);
    this.lastTickAt = now;

    try {
      const wakeupConfig = loadRuntimeWakeupConfig(
        this.options.env ?? process.env,
        this.options.workspaceRoot ?? process.cwd(),
      );
      if (!wakeupConfig) {
        return;
      }
      if (!wakeupConfig.enabled) {
        return;
      }

      this.pruneDeliveredOccurrences(now);
      const dueRuns = collectDueWakeupRuns(wakeupConfig, windowStartMs, now)
        .filter((run) => !run.occurrenceKey || !this.deliveredOccurrences.has(run.occurrenceKey));

      for (const run of dueRuns) {
        if (run.occurrenceKey && run.scheduledForUtc !== null) {
          this.deliveredOccurrences.set(run.occurrenceKey, run.scheduledForUtc);
        }

        await runResolvedWakeup(this.options.runtime, run, "scheduled", this.options);
      }
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      this.options.logError?.(`[clog] scheduled wakeup failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
