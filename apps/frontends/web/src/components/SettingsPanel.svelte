<script lang="ts">
  import type {
    AgentRuntimeSummary,
    IntegrationCapabilitySnapshot,
    IntegrationHealthView,
    IntegrationKind,
  } from "@clog/types";

  type ConsoleEntryKind = "observation" | "finding" | "health" | "info" | "error";

  interface ConsoleEntry {
    readonly id: string;
    readonly at: number;
    readonly kind: ConsoleEntryKind;
    readonly title: string;
    readonly body?: string;
  }

  const {
    runtime,
    integrations,
    capabilities,
    entries,
    refreshBusy = false,
    monitorBusy = false,
    onRefresh,
    onMonitorCycle,
  }: {
    readonly runtime: AgentRuntimeSummary | null;
    readonly integrations: readonly IntegrationHealthView[];
    readonly capabilities: IntegrationCapabilitySnapshot | null;
    readonly entries: readonly ConsoleEntry[];
    readonly refreshBusy?: boolean;
    readonly monitorBusy?: boolean;
    readonly onRefresh: () => void;
    readonly onMonitorCycle: () => void;
  } = $props();

  function intLabel(kind: IntegrationKind): string {
    return kind;
  }

  function kindLabel(kind: ConsoleEntryKind): string {
    switch (kind) {
      case "observation":
        return "obs";
      case "finding":
        return "find";
      case "health":
        return "health";
      case "info":
        return "info";
      case "error":
        return "err";
      default: {
        const exhaustive: never = kind;
        return exhaustive;
      }
    }
  }
</script>

<div class="settings-root">
  <header class="settings-head">
    <h2 class="title">Settings</h2>
    <p class="subtitle">Operational controls, runtime details, and recent activity.</p>
  </header>

  <div class="settings-body">
    <section class="panel">
      <h3 class="panel-title">Controls</h3>
      <div class="actions">
        <button type="button" class="action" disabled={refreshBusy} onclick={onRefresh}>
          {refreshBusy ? "Refreshing…" : "Refresh data"}
        </button>
        <button type="button" class="action" disabled={monitorBusy} onclick={onMonitorCycle}>
          {monitorBusy ? "Running…" : "Run monitor cycle"}
        </button>
      </div>
    </section>

    <section class="panel info-grid">
      <div>
        <h3 class="panel-title">Runtime</h3>
        {#if runtime}
          <dl class="kv">
            <div>
              <dt>Name</dt>
              <dd>{runtime.name}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{runtime.status}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{runtime.executionMode}</dd>
            </div>
            <div>
              <dt>Monitor</dt>
              <dd>{runtime.monitorIntervalMs} ms</dd>
            </div>
          </dl>
        {:else}
          <p class="muted">Runtime details are still loading.</p>
        {/if}
      </div>

      <div>
        <h3 class="panel-title">Capabilities</h3>
        {#if capabilities}
          <p class="muted">
            Shell: {capabilities.shell.canExecute ? "enabled" : "disabled"} · PostHog read: {capabilities.posthog
              .canReadErrors
              ? "enabled"
              : "disabled"}
          </p>
        {:else}
          <p class="muted">Capabilities are still loading.</p>
        {/if}
      </div>

      <div>
        <h3 class="panel-title">Integrations</h3>
        {#if integrations.length === 0}
          <p class="muted">No integrations reported.</p>
        {:else}
          <ul class="integrations">
            {#each integrations as integration, i (`${integration.kind}-${i}`)}
              <li>
                <div class="integration-top">
                  <span class="integration-kind">{intLabel(integration.kind)}</span>
                  <span class="integration-status">{integration.status}</span>
                </div>
                <p class="integration-summary">{integration.summary}</p>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </section>

    <section class="panel activity-panel">
      <div class="panel-row">
        <h3 class="panel-title">Activity</h3>
        <span class="panel-hint">{entries.length} entries</span>
      </div>

      <div class="feed" role="log">
        {#if entries.length === 0}
          <p class="muted">No activity yet. Monitor output and runtime activity will appear here.</p>
        {:else}
          {#each entries as entry (entry.id)}
            <article class="entry" data-kind={entry.kind}>
              <div class="entry-top">
                <span class="entry-kind">{kindLabel(entry.kind)}</span>
                <time class="entry-time">{new Date(entry.at).toLocaleTimeString()}</time>
              </div>
              <div class="entry-title">{entry.title}</div>
              {#if entry.body}
                <pre class="entry-body">{entry.body}</pre>
              {/if}
            </article>
          {/each}
        {/if}
      </div>
    </section>
  </div>
</div>

<style>
  .settings-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .settings-head {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid var(--border-strong);
    background: var(--bg-panel-alt);
    flex-shrink: 0;
  }

  .title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .subtitle {
    margin: 0.25rem 0 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .settings-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 1rem;
    display: grid;
    gap: 1rem;
    align-content: start;
    scrollbar-width: none;
  }

  .settings-body::-webkit-scrollbar,
  .feed::-webkit-scrollbar {
    display: none;
  }

  .panel {
    border: 1px solid var(--border);
    border-radius: 0;
    background: var(--bg-panel);
    padding: 0.9rem;
  }

  .panel-title {
    margin: 0;
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }

  .panel-row {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: baseline;
    margin-bottom: 0.75rem;
  }

  .panel-hint,
  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.82rem;
  }

  .actions {
    display: flex;
    gap: 0.65rem;
    flex-wrap: wrap;
  }

  .action {
    font: inherit;
    border: 1px solid var(--accent-strong);
    border-radius: 0;
    background: var(--accent-strong);
    color: var(--text-primary);
    padding: 0.55rem 0.8rem;
    cursor: pointer;
  }

  .action:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .info-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .kv {
    margin: 0.75rem 0 0;
    display: grid;
    gap: 0.55rem;
  }

  .kv div {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: baseline;
  }

  .kv dt {
    color: var(--text-muted);
  }

  .kv dd {
    margin: 0;
    text-align: right;
    font-family: ui-monospace, monospace;
  }

  .integrations {
    list-style: none;
    margin: 0.75rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }

  .integration-top {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    align-items: baseline;
  }

  .integration-kind {
    font-weight: 600;
  }

  .integration-status {
    font-size: 0.76rem;
    color: var(--text-muted);
    font-family: ui-monospace, monospace;
  }

  .integration-summary {
    margin: 0.2rem 0 0;
    color: var(--text-muted);
    font-size: 0.82rem;
  }

  .activity-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .feed {
    overflow: auto;
    min-height: 0;
    max-height: 18rem;
    scrollbar-width: none;
  }

  .entry {
    border-top: 1px solid var(--border);
    padding: 0.75rem 0;
  }

  .entry:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .entry-top {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    color: var(--text-muted);
    font-size: 0.76rem;
    font-family: ui-monospace, monospace;
  }

  .entry-title {
    margin-top: 0.2rem;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .entry-body {
    margin: 0.3rem 0 0;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text-muted);
    font-size: 0.78rem;
  }

  @media (max-width: 900px) {
    .info-grid {
      grid-template-columns: 1fr;
    }

    .panel-row {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
