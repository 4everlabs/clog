<script lang="ts">
  import type {
    AgentRuntimeSummary,
    IntegrationCapabilitySnapshot,
    IntegrationHealthView,
    IntegrationKind,
    SurfaceChannelKind,
  } from "@clog/types";

  type ThreadRow = {
    readonly id: string;
    readonly title: string;
    readonly channel: SurfaceChannelKind;
    readonly updatedAt: number;
  };

  const {
    runtime,
    channels,
    integrations,
    capabilities,
    threads,
    activeThreadId,
    newThreadTitle = "",
    refreshBusy = false,
    monitorBusy = false,
    onNewThreadTitleChange,
    onSelectThread,
    onRefresh,
    onMonitorCycle,
  }: {
    readonly runtime: AgentRuntimeSummary | null;
    readonly channels: readonly SurfaceChannelKind[];
    readonly integrations: readonly IntegrationHealthView[];
    readonly capabilities: IntegrationCapabilitySnapshot | null;
    readonly threads: readonly ThreadRow[];
    readonly newThreadTitle?: string;
    readonly activeThreadId: string | null;
    readonly refreshBusy?: boolean;
    readonly monitorBusy?: boolean;
    readonly onNewThreadTitleChange: (value: string) => void;
    readonly onSelectThread: (threadId: string) => void;
    readonly onRefresh: () => void;
    readonly onMonitorCycle: () => void;
  } = $props();

  function intLabel(kind: IntegrationKind): string {
    return kind;
  }
</script>

<aside class="side">
  <div class="brand">Clog</div>

  <section class="block">
    <h3 class="h">Runtime</h3>
    {#if !runtime}
      <p class="muted">Loading…</p>
    {:else}
      <dl class="kv">
        <dt>Name</dt>
        <dd>{runtime.name}</dd>
        <dt>Status</dt>
        <dd>{runtime.status}</dd>
        <dt>Mode</dt>
        <dd>{runtime.executionMode}</dd>
        <dt>Monitor</dt>
        <dd>{runtime.monitorIntervalMs} ms</dd>
        <dt>Active integrations</dt>
        <dd>{runtime.activeIntegrations.join(", ") || "—"}</dd>
      </dl>
    {/if}
  </section>

  <section class="block">
    <h3 class="h">Channels</h3>
    {#if channels.length === 0}
      <p class="muted">None</p>
    {:else}
      <ul class="list">
        {#each channels as ch (ch)}
          <li>{ch}</li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="block">
    <h3 class="h">Integrations</h3>
    {#if integrations.length === 0}
      <p class="muted">None reported</p>
    {:else}
      <ul class="int-list">
        {#each integrations as integ, i (`${integ.kind}-${i}`)}
          <li>
            <span class="int-kind">{intLabel(integ.kind)}</span>
            <span class="int-st">{integ.status}</span>
            <div class="int-sum">{integ.summary}</div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if capabilities}
    <section class="block">
      <h3 class="h">Capabilities</h3>
      <p class="caps">
        Shell: {capabilities.shell.canExecute ? "execute" : "no"} · PostHog read: {capabilities.posthog.canReadErrors
          ? "errors"
          : "—"}
      </p>
    </section>
  {/if}

  <section class="block">
    <h3 class="h">Threads</h3>
    <label class="lbl" for="new-title">New thread title</label>
    <input
      id="new-title"
      class="title-input"
      type="text"
      placeholder="optional"
      value={newThreadTitle}
      oninput={(event) => {
        onNewThreadTitleChange((event.currentTarget as HTMLInputElement).value);
      }}
    />
    <div class="actions">
      <button type="button" class="btn" disabled={refreshBusy} onclick={onRefresh}>
        {refreshBusy ? "Refresh…" : "Refresh"}
      </button>
      <button type="button" class="btn" disabled={monitorBusy} onclick={onMonitorCycle}>
        {monitorBusy ? "Monitor…" : "Monitor cycle"}
      </button>
    </div>
    {#if threads.length === 0}
      <p class="muted">No threads</p>
    {:else}
      <ul class="threads">
        {#each threads as t (t.id)}
          <li>
            <button
              type="button"
              class="thread"
              data-active={activeThreadId === t.id}
              onclick={() => onSelectThread(t.id)}
            >
              <span class="tt">{t.title || "(untitled)"}</span>
              <span class="tc">{t.channel}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</aside>

<style>
  .side {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding: 0.5rem 0.55rem;
    height: 100%;
    overflow: auto;
    font-size: 0.82rem;
  }

  .brand {
    font-weight: 700;
    font-size: 0.95rem;
    border-bottom: 1px solid #bbb;
    padding-bottom: 0.35rem;
  }

  .block {
    border-bottom: 1px solid #e8e8e8;
    padding-bottom: 0.5rem;
  }

  .h {
    margin: 0 0 0.35rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #444;
  }

  .muted {
    margin: 0;
    color: #666;
  }

  .kv {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.15rem 0.5rem;
    font-size: 0.78rem;
  }

  .kv dt {
    color: #555;
  }

  .kv dd {
    margin: 0;
    font-family: ui-monospace, monospace;
  }

  .list {
    margin: 0;
    padding-left: 1.1rem;
  }

  .int-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .int-list li {
    margin-bottom: 0.35rem;
  }

  .int-kind {
    font-weight: 600;
    margin-right: 0.35rem;
  }

  .int-st {
    font-family: ui-monospace, monospace;
    font-size: 0.72rem;
    color: #333;
  }

  .int-sum {
    font-size: 0.75rem;
    color: #444;
    margin-top: 0.1rem;
  }

  .caps {
    margin: 0;
    font-size: 0.75rem;
    color: #333;
  }

  .lbl {
    display: block;
    font-size: 0.72rem;
    margin-bottom: 0.2rem;
    color: #444;
  }

  .title-input {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    padding: 0.25rem 0.35rem;
    margin-bottom: 0.4rem;
  }

  .actions {
    display: flex;
    gap: 0.35rem;
    margin-bottom: 0.45rem;
    flex-wrap: wrap;
  }

  .btn {
    font: inherit;
    font-size: 0.78rem;
    padding: 0.25rem 0.45rem;
    cursor: pointer;
  }

  .btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .threads {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .thread {
    width: 100%;
    text-align: left;
    font: inherit;
    font-size: 0.78rem;
    padding: 0.3rem 0.35rem;
    margin-bottom: 0.25rem;
    border: 1px solid #c8c8c8;
    background: #fff;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .thread[data-active="true"] {
    background: #eef3ff;
    border-color: #99aacc;
  }

  .tt {
    font-weight: 500;
  }

  .tc {
    font-family: ui-monospace, monospace;
    font-size: 0.7rem;
    color: #555;
  }
</style>
