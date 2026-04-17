<script lang="ts">
  type ConsoleEntryKind = "observation" | "finding" | "health" | "info" | "error";

  interface ConsoleEntry {
    readonly id: string;
    readonly at: number;
    readonly kind: ConsoleEntryKind;
    readonly title: string;
    readonly body?: string;
  }

  const {
    entries,
  }: {
    readonly entries: readonly ConsoleEntry[];
  } = $props();

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
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  }
</script>

<div class="console-root">
  <header class="head">Console</header>
  <div class="feed" role="log">
    {#if entries.length === 0}
      <p class="empty">No activity yet. Monitor tick and runtime activity appear here.</p>
    {:else}
      {#each entries as entry (entry.id)}
        <article class="entry" data-kind={entry.kind}>
          <div class="entry-top">
            <span class="kind">{kindLabel(entry.kind)}</span>
            <time class="when">{new Date(entry.at).toLocaleTimeString()}</time>
          </div>
          <div class="entry-title">{entry.title}</div>
          {#if entry.body}
            <pre class="entry-body">{entry.body}</pre>
          {/if}
        </article>
      {/each}
    {/if}
  </div>
</div>

<style>
  .console-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    font-size: 0.8rem;
    background: var(--bg-sidebar);
    color: var(--text-primary);
  }

  .head {
    border-bottom: 1px solid var(--border-strong);
    background: var(--bg-panel-alt);
    padding: 0.45rem 0.5rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .feed {
    flex: 1;
    overflow: auto;
    padding: 0.35rem 0.45rem;
    min-height: 0;
    font-family: ui-monospace, monospace;
    background: var(--bg-sidebar);
  }

  .empty {
    margin: 0.5rem 0;
    color: var(--text-muted);
    font-family: inherit;
  }

  .entry {
    border-bottom: 1px solid var(--border);
    padding: 0.35rem 0;
  }

  .entry-top {
    display: flex;
    justify-content: space-between;
    gap: 0.35rem;
    color: var(--text-muted);
    font-size: 0.72rem;
  }

  .kind {
    text-transform: uppercase;
  }

  .entry-title {
    margin-top: 0.15rem;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .entry-body {
    margin: 0.2rem 0 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 0.75rem;
    color: var(--text-muted);
  }
</style>
