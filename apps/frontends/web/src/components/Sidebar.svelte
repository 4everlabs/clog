<script lang="ts">
  import { onMount } from "svelte";
  import { SvelteDate } from "svelte/reactivity";
  import type { AgentRuntimeSummary } from "@clog/types";

  type View = "chat" | "wakeup" | "settings";

  interface Props {
    readonly runtime: AgentRuntimeSummary | null;
    readonly sessionStartedAt?: number | null;
    readonly activeView: View;
    readonly onSelectView: (view: View) => void;
  }

  const props: Props = $props();

  const now = new SvelteDate();

  const startedAt = $derived(props.sessionStartedAt ?? props.runtime?.bootedAt ?? null);
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

  onMount(() => {
    const intervalId = window.setInterval(() => {
      now.setTime(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  });

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
      data-active={props.activeView === "wakeup"}
      onclick={() => props.onSelectView("wakeup")}
    >
      Wakeup
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
