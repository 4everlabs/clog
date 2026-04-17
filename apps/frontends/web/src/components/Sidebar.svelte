<script lang="ts">
  import type { AgentRuntimeSummary, IntegrationHealthView } from "@clog/types";

  const {
    runtime,
    integrations,
    threadCount,
    activeView,
    onSelectView,
  }: {
    readonly runtime: AgentRuntimeSummary | null;
    readonly integrations: readonly IntegrationHealthView[];
    readonly threadCount: number;
    readonly activeView: "chat" | "settings";
    readonly onSelectView: (view: "chat" | "settings") => void;
  } = $props();
</script>

<aside class="side">
  <div class="brand">Clog</div>

  <section class="summary">
    <p class="runtime-name">{runtime?.name ?? "Loading runtime"}</p>
    <p class="status" data-status={runtime?.status ?? "loading"}>{runtime?.status ?? "loading"}</p>
    <dl class="meta">
      <div>
        <dt>Threads</dt>
        <dd>{threadCount}</dd>
      </div>
      <div>
        <dt>Integrations</dt>
        <dd>{runtime?.activeIntegrations.length ?? integrations.length}</dd>
      </div>
      <div>
        <dt>Mode</dt>
        <dd>{runtime?.executionMode ?? "—"}</dd>
      </div>
    </dl>
  </section>

  <nav class="nav" aria-label="Views">
    <button
      type="button"
      class="tab"
      data-active={activeView === "chat"}
      onclick={() => onSelectView("chat")}
    >
      Chat
    </button>
    <button
      type="button"
      class="tab"
      data-active={activeView === "settings"}
      onclick={() => onSelectView("settings")}
    >
      Settings
    </button>
  </nav>
</aside>

<style>
  .side {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.85rem 0.75rem;
    height: 100%;
    overflow: auto;
    font-size: 0.82rem;
    scrollbar-width: none;
    color: var(--text-primary);
  }

  .side::-webkit-scrollbar {
    display: none;
  }

  .brand {
    font-weight: 700;
    font-size: 1rem;
    letter-spacing: 0.02em;
  }

  .summary {
    border: 1px solid var(--border);
    border-radius: 0;
    background: var(--bg-panel);
    padding: 0.85rem;
  }

  .runtime-name {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .status {
    display: inline-flex;
    align-items: center;
    margin: 0.45rem 0 0;
    padding: 0.2rem 0.5rem;
    border-radius: 0;
    background: var(--bg-panel-alt);
    color: var(--text-muted);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status[data-status="running"],
  .status[data-status="healthy"] {
    background: #dcefe2;
    color: #205533;
  }

  .status[data-status="error"],
  .status[data-status="failed"] {
    background: #f3dcdf;
    color: #7a2430;
  }

  .meta {
    margin: 0.85rem 0 0;
    display: grid;
    gap: 0.55rem;
  }

  .meta div {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    align-items: baseline;
  }

  .meta dt {
    color: var(--text-muted);
  }

  .meta dd {
    margin: 0;
    text-align: right;
    font-family: ui-monospace, monospace;
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
