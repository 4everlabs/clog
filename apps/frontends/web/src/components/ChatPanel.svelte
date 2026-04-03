<script lang="ts">
  import type { ConversationThread } from "@clog/types";
  import MessageItem from "./MessageItem.svelte";

  const {
    activeThread,
    sending = false,
    onSend,
  }: {
    readonly activeThread: ConversationThread | null;
    readonly sending?: boolean;
    readonly onSend: (body: string) => void;
  } = $props();

  let draft = $state("");

  function submit() {
    if (sending) {
      return;
    }
    const text = draft.trim();
    if (!text) {
      return;
    }
    onSend(text);
    draft = "";
  }
</script>

<div class="chat-root">
  <header class="chat-head">
    {#if activeThread}
      <h2 class="title">{activeThread.title || "(untitled)"}</h2>
      <span class="meta">{activeThread.channel} · {activeThread.id}</span>
    {:else}
      <h2 class="title">Chat</h2>
      <span class="meta muted">No active thread</span>
    {/if}
  </header>

  <div class="messages">
    {#if !activeThread}
      <div class="empty">
        <p>No thread yet. Send a message below to create one, or pick a thread in the sidebar.</p>
      </div>
    {:else if activeThread.messages.length === 0}
      <div class="empty">
        <p>No messages in this thread.</p>
      </div>
    {:else}
      {#each activeThread.messages as message (message.id)}
        <MessageItem {message} />
      {/each}
    {/if}
  </div>

  <footer class="composer">
    <textarea
      class="input"
      rows="3"
      placeholder="Message…"
      bind:value={draft}
      disabled={sending}
      onkeydown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          submit();
        }
      }}
    ></textarea>
    <button type="button" class="send" disabled={sending} onclick={submit}>
      {sending ? "Sending…" : "Send"}
    </button>
  </footer>
</div>

<style>
  .chat-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .chat-head {
    border-bottom: 1px solid #bbb;
    padding: 0.5rem 0.75rem;
    flex-shrink: 0;
  }

  .title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .meta {
    display: block;
    font-size: 0.75rem;
    margin-top: 0.15rem;
    font-family: ui-monospace, monospace;
  }

  .muted {
    color: #666;
  }

  .messages {
    flex: 1;
    overflow: auto;
    padding: 0.5rem 0.75rem;
    min-height: 0;
  }

  .empty {
    color: #555;
    font-size: 0.9rem;
    padding: 1rem 0;
  }

  .composer {
    border-top: 1px solid #bbb;
    padding: 0.5rem 0.75rem;
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
    flex-shrink: 0;
  }

  .input {
    flex: 1;
    resize: vertical;
    font: inherit;
    padding: 0.35rem 0.45rem;
    min-height: 3.5rem;
  }

  .send {
    font: inherit;
    padding: 0.35rem 0.65rem;
    cursor: pointer;
  }

  .send:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
