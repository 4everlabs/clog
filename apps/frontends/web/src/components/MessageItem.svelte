<script lang="ts">
  import type { ConversationMessage } from "@clog/types";

  const { message }: { readonly message: ConversationMessage } = $props();

  const timeLabel = $derived(
    new Date(message.createdAt).toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      month: "short",
      day: "numeric",
    }),
  );
</script>

<div class="msg" data-role={message.role}>
  <header class="msg-head">
    <span class="role">{message.role}</span>
    <span class="chan">{message.channel}</span>
    <time class="time">{timeLabel}</time>
  </header>
  <pre class="body">{message.content}</pre>
  {#if message.role === "agent"}
    <details class="thoughts">
      <summary>Thoughts</summary>
      <p class="muted">
        Structured thought traces are not yet exposed by the runtime API.
      </p>
    </details>
  {/if}
</div>

<style>
  .msg {
    border: 1px solid #c8c8c8;
    padding: 0.5rem 0.6rem;
    margin-bottom: 0.5rem;
    background: #fafafa;
    font-size: 0.875rem;
  }

  .msg-head {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    margin-bottom: 0.35rem;
    font-size: 0.75rem;
    color: #444;
  }

  .role {
    font-weight: 600;
    text-transform: uppercase;
  }

  .chan {
    font-family: ui-monospace, monospace;
  }

  .time {
    margin-left: auto;
    color: #666;
  }

  .body {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
  }

  .thoughts {
    margin-top: 0.4rem;
    font-size: 0.8rem;
  }

  .muted {
    margin: 0.25rem 0 0;
    color: #555;
  }
</style>
