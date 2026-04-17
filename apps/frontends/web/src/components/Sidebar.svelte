<script lang="ts">
  import { onMount } from "svelte";
  import { SvelteDate } from "svelte/reactivity";
  import type { AgentRuntimeSummary, RuntimeWakeupConfig } from "@clog/types";

  interface WakeupDraft {
    readonly intervalMinutes: number;
    readonly message: string;
  }
  interface Props {
    readonly runtime: AgentRuntimeSummary | null;
    readonly wakeup?: RuntimeWakeupConfig | null;
    readonly sessionStartedAt?: number | null;
    readonly activeView: "chat" | "settings";
    readonly wakeupSaveBusy?: boolean;
    readonly wakeupSaveError?: string | null;
    readonly onSelectView: (view: "chat" | "settings") => void;
    readonly onSaveWakeup: (draft: WakeupDraft) => void | Promise<void>;
  }

  const DEFAULT_WAKEUP_INTERVAL_MINUTES = 15;

  const props: Props = $props();

  const now = new SvelteDate();

  const startedAt = $derived(props.sessionStartedAt ?? props.runtime?.bootedAt ?? null);
  const wakeupIntervalMinutes = $derived(resolveWakeupIntervalMinutes(props.wakeup ?? null));
  const wakeupMessage = $derived(props.wakeup?.message ?? "");
  const wakeupSourceKey = $derived(createWakeupSignature(wakeupIntervalMinutes, wakeupMessage));
  const sessionStartedLabel = $derived.by(() => {
    if (startedAt === null) {
      return "Loading...";
    }

    return new Date(startedAt).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  });
  const sessionDurationLabel = $derived.by(() => {
    if (startedAt === null) {
      return "--";
    }

    return formatDuration(now.getTime() - startedAt);
  });

  let draftIntervalMinutes = $state<number | undefined>(DEFAULT_WAKEUP_INTERVAL_MINUTES);
  let draftMessage = $state("");
  let lastSyncedWakeupKey = "";

  onMount(() => {
    const intervalId = window.setInterval(() => {
      now.setTime(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  });

  $effect(() => {
    const nextWakeupKey = wakeupSourceKey;
    if (nextWakeupKey === lastSyncedWakeupKey) {
      return;
    }

    const draftKey = createWakeupSignature(draftIntervalMinutes, draftMessage);
    if (!lastSyncedWakeupKey || draftKey === lastSyncedWakeupKey) {
      draftIntervalMinutes = wakeupIntervalMinutes;
      draftMessage = wakeupMessage;
    }

    lastSyncedWakeupKey = nextWakeupKey;
  });

  const wakeupValid = $derived(
    draftIntervalMinutes !== undefined &&
      Number.isInteger(draftIntervalMinutes) &&
      draftIntervalMinutes > 0 &&
      draftMessage.trim().length > 0,
  );
  const wakeupDirty = $derived(createWakeupSignature(draftIntervalMinutes, draftMessage) !== wakeupSourceKey);
  const wakeupSaveDisabled = $derived((props.wakeupSaveBusy ?? false) || !wakeupValid || !wakeupDirty);

  function formatDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    }

    if (hours > 0) {
      return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
    }

    if (minutes > 0) {
      return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
    }

    return `${seconds}s`;
  }

  function resolveWakeupIntervalMinutes(config: RuntimeWakeupConfig | null): number {
    if (!config || !Number.isFinite(config.intervalMs)) {
      return DEFAULT_WAKEUP_INTERVAL_MINUTES;
    }

    return Math.max(1, Math.round(config.intervalMs / 60_000));
  }

  function createWakeupSignature(intervalMinutes: number | undefined, message: string): string {
    return `${intervalMinutes ?? ""}\u0000${message}`;
  }

  function handleWakeupSubmit(event: SubmitEvent): void {
    event.preventDefault();
    if (
      draftIntervalMinutes === undefined ||
      !Number.isInteger(draftIntervalMinutes) ||
      draftIntervalMinutes < 1 ||
      !draftMessage.trim()
    ) {
      return;
    }

    void props.onSaveWakeup({
      intervalMinutes: draftIntervalMinutes,
      message: draftMessage,
    });
  }
</script>

<aside class="side">
  <section class="session-info" aria-label="Session info">
    <dl class="timing">
      <div>
        <dt>Started</dt>
        <dd>{sessionStartedLabel}</dd>
      </div>
      <div>
        <dt>Running</dt>
        <dd>{sessionDurationLabel}</dd>
      </div>
    </dl>
  </section>

  <nav class="nav" aria-label="Views">
    <button
      type="button"
      class="tab"
      data-active={props.activeView === "chat"}
      onclick={() => props.onSelectView("chat")}
    >
      Chat
    </button>
    <button
      type="button"
      class="tab"
      data-active={props.activeView === "settings"}
      onclick={() => props.onSelectView("settings")}
    >
      Settings
    </button>
  </nav>

  <section class="wakeup" aria-label="Wakeup settings">
    <div class="section-title">Wakeup</div>

    <form class="wakeup-form" onsubmit={handleWakeupSubmit}>
      <label class="field">
        <span class="field-label">Every</span>
        <div class="minutes-row">
          <input type="number" min="1" step="1" bind:value={draftIntervalMinutes} />
          <span class="suffix">min</span>
        </div>
      </label>

      <label class="field">
        <span class="field-label">Prompt</span>
        <textarea bind:value={draftMessage} rows="5" placeholder="Wakeup prompt"></textarea>
      </label>

      {#if props.wakeupSaveError}
        <p class="error-text" role="alert">{props.wakeupSaveError}</p>
      {/if}

      <button class="save-button" type="submit" disabled={wakeupSaveDisabled}>
        {props.wakeupSaveBusy ? "Saving..." : "Save"}
      </button>
    </form>
  </section>
</aside>

<style>
  .side {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem 0.65rem;
    height: 100%;
    overflow: auto;
    font-size: 0.82rem;
    scrollbar-width: none;
    color: var(--text-primary);
  }

  .side::-webkit-scrollbar {
    display: none;
  }

  .session-info {
    border: 1px solid var(--border);
    border-radius: 0;
    background: var(--bg-panel);
    padding: 0.7rem;
  }

  .timing {
    margin: 0;
    display: grid;
    gap: 0.6rem;
  }

  .timing div {
    display: grid;
    gap: 0.18rem;
  }

  .timing dt {
    color: var(--text-muted);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .timing dd {
    margin: 0;
    font-family: ui-monospace, monospace;
    font-size: 0.76rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .nav {
    display: grid;
    gap: 0.45rem;
  }

  .wakeup {
    border: 1px solid var(--border);
    background: var(--bg-panel);
    padding: 0.55rem;
    display: grid;
    gap: 0.55rem;
  }

  .section-title,
  .field-label {
    color: var(--text-muted);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .wakeup-form {
    display: grid;
    gap: 0.5rem;
  }

  .field {
    display: grid;
    gap: 0.22rem;
  }

  .minutes-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.35rem;
    align-items: center;
  }

  .suffix {
    color: var(--text-subtle);
    font-size: 0.72rem;
    white-space: nowrap;
  }

  .field input,
  .field textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--border);
    border-radius: 0;
    background: var(--bg-input);
    color: var(--text-primary);
    font: inherit;
    padding: 0.42rem 0.48rem;
  }

  .field textarea {
    min-height: 5.6rem;
    resize: vertical;
    line-height: 1.35;
  }

  .save-button {
    width: 100%;
    font: inherit;
    border: 1px solid var(--border);
    border-radius: 0;
    background: var(--accent);
    color: var(--text-primary);
    padding: 0.55rem 0.75rem;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease,
      opacity 0.15s ease;
  }

  .save-button:hover:not(:disabled) {
    background: var(--accent-strong);
    border-color: var(--accent-strong);
  }

  .save-button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .error-text {
    margin: 0;
    color: #7a2832;
    font-size: 0.73rem;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .tab {
    width: 100%;
    font: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: 0;
    background: var(--bg-panel);
    color: var(--text-primary);
    padding: 0.65rem 0.75rem;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease;
  }

  .tab:hover {
    background: var(--bg-panel-alt);
  }

  .tab[data-active="true"] {
    background: var(--accent-strong);
    border-color: var(--accent-strong);
    color: var(--text-primary);
  }
</style>
