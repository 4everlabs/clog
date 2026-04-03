<script lang="ts">
  type ConsoleEntryKind = "observation" | "finding" | "health" | "shell" | "info" | "error";

  interface ConsoleEntry {
    readonly id: string;
    readonly at: number;
    readonly kind: ConsoleEntryKind;
    readonly title: string;
    readonly body?: string;
  }

  const {
    entries,
    shellBusy = false,
    onRunShell,
  }: {
    readonly entries: readonly ConsoleEntry[];
    readonly shellBusy?: boolean;
    readonly onRunShell: (line: string) => void;
  } = $props();

  let shellLine = $state("");

  function runShell() {
    if (shellBusy) {
      return;
    }
    const line = shellLine.trim();
    if (!line) {
      return;
    }
    onRunShell(line);
    shellLine = "";
  }

  function kindLabel(kind: ConsoleEntryKind): string {
    switch (kind) {
      case "observation":
        return "obs";
      case "finding":
        return "find";
      case "health":
        return "health";
      case "shell":
        return "shell";
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
      <p class="empty">No activity yet. Monitor tick and shell output appear here.</p>
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
  <footer class="shell">
    <label class="shell-label" for="shell-input">Shell</label>
    <div class="shell-row">
      <input
        id="shell-input"
        class="shell-input"
        type="text"
        autocomplete="off"
        spellcheck="false"
        placeholder="command args…"
        bind:value={shellLine}
        disabled={shellBusy}
        onkeydown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            runShell();
          }
        }}
      />
      <button type="button" class="shell-run" disabled={shellBusy} onclick={runShell}>
        {shellBusy ? "…" : "Run"}
      </button>
    </div>
  </footer>
</div>

<style>
  .console-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    font-size: 0.8rem;
  }

  .head {
    border-bottom: 1px solid #bbb;
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
  }

  .empty {
    margin: 0.5rem 0;
    color: #555;
    font-family: inherit;
  }

  .entry {
    border-bottom: 1px solid #e0e0e0;
    padding: 0.35rem 0;
  }

  .entry-top {
    display: flex;
    justify-content: space-between;
    gap: 0.35rem;
    color: #555;
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
    color: #333;
  }

  .shell {
    border-top: 1px solid #bbb;
    padding: 0.4rem 0.45rem;
    flex-shrink: 0;
  }

  .shell-label {
    display: block;
    font-size: 0.72rem;
    margin-bottom: 0.2rem;
    color: #444;
  }

  .shell-row {
    display: flex;
    gap: 0.35rem;
  }

  .shell-input {
    flex: 1;
    font: inherit;
    font-family: ui-monospace, monospace;
    padding: 0.25rem 0.35rem;
  }

  .shell-run {
    font: inherit;
    padding: 0.25rem 0.45rem;
    cursor: pointer;
  }

  .shell-run:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
