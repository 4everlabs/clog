<script lang="ts">
  import type { ConversationThread } from "@clog/types";
  import MessageItem from "./MessageItem.svelte";

  type ThreadRow = {
    readonly id: string;
    readonly title: string;
  };

  const {
    activeThread,
    threads,
    activeThreadId,
    newThreadTitle = "",
    sending = false,
    onSend,
    onSelectThread,
    onNewThreadTitleChange,
  }: {
    readonly activeThread: ConversationThread | null;
    readonly threads: readonly ThreadRow[];
    readonly activeThreadId: string | null;
    readonly newThreadTitle?: string;
    readonly sending?: boolean;
    readonly onSend: (body: string) => void;
    readonly onSelectThread: (threadId: string | null) => void;
    readonly onNewThreadTitleChange: (value: string) => void;
  } = $props();

  let draft = $state("");

  function submit(): void {
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
    <div class="head-top">
      <div class="field">
        <label class="field-label" for="thread-select">Conversation</label>
        <select
          id="thread-select"
          class="thread-select"
          value={activeThreadId ?? "__new__"}
          onchange={(event) => {
            const value = (event.currentTarget as HTMLSelectElement).value;
            onSelectThread(value === "__new__" ? null : value);
          }}
        >
          <option value="__new__">New conversation</option>
          {#each threads as thread (thread.id)}
            <option value={thread.id}>{thread.title || "(untitled)"}</option>
          {/each}
        </select>
      </div>

      <div class="field title-field">
        <label class="field-label" for="new-thread-title">New conversation title</label>
        <input
          id="new-thread-title"
          class="new-title"
          type="text"
          placeholder="Optional"
          value={newThreadTitle}
          disabled={activeThreadId !== null}
          oninput={(event) => {
            onNewThreadTitleChange((event.currentTarget as HTMLInputElement).value);
          }}
        />
      </div>
    </div>

    {#if activeThread}
      <h2 class="title">{activeThread.title || "(untitled)"}</h2>
      <span class="meta">Thread ID {activeThread.id}</span>
    {:else}
      <h2 class="title">New conversation</h2>
      <span class="meta muted">Select an existing thread above or send a message to create one.</span>
    {/if}
  </header>

  <div class="messages">
    {#if !activeThread}
      <div class="empty">
        <p>Send a message below to start a new conversation, or switch threads from the dropdown above.</p>
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
      onkeydown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
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
    border-bottom: 1px solid var(--border-strong);
    background: var(--bg-panel-alt);
    padding: 0.5rem 0.75rem;
    flex-shrink: 0;
  }

  .head-top {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .field {
    min-width: 0;
  }

  .field-label {
    display: block;
    font-size: 0.72rem;
    color: var(--text-muted);
    margin-bottom: 0.25rem;
  }

  .thread-select,
  .new-title {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    border: 1px solid var(--border);
    border-radius: 0;
    background: var(--bg-input);
    color: var(--text-primary);
    padding: 0.45rem 0.6rem;
  }

  .new-title:disabled {
    background: var(--bg-panel);
    color: var(--text-subtle);
  }

  .title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .meta {
    display: block;
    font-size: 0.75rem;
    margin-top: 0.15rem;
    font-family: ui-monospace, monospace;
    color: var(--text-muted);
  }

  .muted {
    color: var(--text-muted);
  }

  .messages {
    flex: 1;
    overflow: auto;
    padding: 0.5rem 0.75rem;
    min-height: 0;
    scrollbar-width: none;
    background: var(--bg-main);
  }

  .messages::-webkit-scrollbar {
    display: none;
  }

  .empty {
    color: var(--text-muted);
    font-size: 0.9rem;
    padding: 1rem 0;
  }

  .composer {
    border-top: 1px solid var(--border-strong);
    background: var(--bg-panel-alt);
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
    border: 1px solid var(--border);
    border-radius: 0;
    background: var(--bg-input);
    color: var(--text-primary);
  }

  .send {
    font: inherit;
    padding: 0.35rem 0.65rem;
    cursor: pointer;
    border: 1px solid var(--accent-strong);
    border-radius: 0;
    background: var(--accent-strong);
    color: var(--text-primary);
  }

  .send:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .thread-select::placeholder,
  .new-title::placeholder,
  .input::placeholder {
    color: var(--text-subtle);
  }

  @media (max-width: 840px) {
    .head-top {
      grid-template-columns: 1fr;
    }
  }
</style>
