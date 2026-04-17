<script lang="ts">
  import type { ConversationMessage } from "@clog/types";

  const { message }: { readonly message: ConversationMessage } = $props();

  type MessageSegment = {
    readonly text: string;
    readonly bold: boolean;
  };

  const TELEGRAM_BOLD_PATTERN =
    /\*\*([^\s*](?:[^*\n]*[^\s*])?)\*\*|(?<!\*)\*([^\s*](?:[^*\n]*[^\s*])?)\*(?!\*)/g;

  function formatMessageContent(value: string): MessageSegment[] {
    const segments: MessageSegment[] = [];
    let lastIndex = 0;

    for (const match of value.matchAll(TELEGRAM_BOLD_PATTERN)) {
      const index = match.index ?? 0;

      if (index > lastIndex) {
        segments.push({
          text: value.slice(lastIndex, index),
          bold: false,
        });
      }

      segments.push({
        text: match[1] ?? match[2] ?? "",
        bold: true,
      });
      lastIndex = index + match[0].length;
    }

    if (lastIndex < value.length) {
      segments.push({
        text: value.slice(lastIndex),
        bold: false,
      });
    }

    return segments;
  }

  const timeLabel = $derived(
    new Date(message.createdAt).toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      month: "short",
      day: "numeric",
    }),
  );

  const formattedContent = $derived(formatMessageContent(message.content));
</script>

<div class="msg" data-role={message.role}>
  <header class="msg-head">
    <span class="role">{message.role}</span>
    <time class="time">{timeLabel}</time>
  </header>
  <pre class="body">{#each formattedContent as segment, index (index)}{#if segment.bold}<strong>{segment.text}</strong>{:else}{segment.text}{/if}{/each}</pre>
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
    border: 1px solid var(--border);
    padding: 0.5rem 0.6rem;
    margin-bottom: 0.5rem;
    background: var(--bg-panel);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .msg[data-role="user"] {
    background: var(--accent-strong);
    border-color: var(--accent-strong);
  }

  .msg-head {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    margin-bottom: 0.35rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .role {
    font-weight: 600;
    text-transform: uppercase;
  }

  .time {
    margin-left: auto;
    color: var(--text-subtle);
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
    color: var(--text-muted);
  }
</style>
