<script lang="ts">
  import type { ConversationMessage, ConversationThoughtStep } from "@clog/types";
  import { renderMarkdownToHtml } from "../markdown";

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

  const formattedContentHtml = $derived(renderMarkdownToHtml(message.content));
  const thoughtSteps = $derived<readonly ConversationThoughtStep[]>(
    message.thoughts && message.thoughts.length > 0
      ? message.thoughts
      : message.reasoning
        ? [{
            stepNumber: 1,
            reasoning: message.reasoning,
          }]
        : [],
  );
</script>

<div class="msg" data-role={message.role}>
  <header class="msg-head">
    <span class="role">{message.role}</span>
    <time class="time">{timeLabel}</time>
  </header>
  <div class="body">{@html formattedContentHtml}</div>
  {#if message.role === "agent" && thoughtSteps.length > 0}
    <details class="thoughts">
      <summary>Thoughts</summary>
      <div class="thought-steps">
        {#each thoughtSteps as step (step.stepNumber)}
          <section class="thought-step">
            <div class="thought-step-title">Step {step.stepNumber}</div>

            {#if step.reasoning}
              <div class="thought-section-label">Reasoning</div>
              <pre class="thought-block">{step.reasoning}</pre>
            {/if}

            {#if step.toolCalls?.length}
              <div class="thought-section-label">Tool calls</div>
              <ul class="thought-list">
                {#each step.toolCalls as toolCall (`${step.stepNumber}-${toolCall.toolCallId}`)}
                  <li class="thought-list-item">
                    <code class="thought-tool-name">{toolCall.toolName}</code>
                    {#if toolCall.input}
                      <pre class="thought-block thought-block-compact">{toolCall.input}</pre>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}

            {#if step.toolResults?.length}
              <div class="thought-section-label">Tool results</div>
              <ul class="thought-list">
                {#each step.toolResults as toolResult (`${step.stepNumber}-${toolResult.toolCallId}`)}
                  <li class="thought-list-item">
                    <code class="thought-tool-name" data-error={toolResult.isError ? "true" : undefined}>
                      {toolResult.toolName}
                    </code>
                    <pre class="thought-block thought-block-compact" data-error={toolResult.isError ? "true" : undefined}>
                      {toolResult.output}
                    </pre>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/each}
      </div>
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
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .body :global(:first-child) {
    margin-top: 0;
  }

  .body :global(:last-child) {
    margin-bottom: 0;
  }

  .body :global(p),
  .body :global(ul),
  .body :global(ol),
  .body :global(blockquote),
  .body :global(pre) {
    margin: 0.5rem 0 0;
  }

  .body :global(h1),
  .body :global(h2),
  .body :global(h3),
  .body :global(h4),
  .body :global(h5),
  .body :global(h6) {
    margin: 0.75rem 0 0.35rem;
    line-height: 1.2;
    font-weight: 700;
  }

  .body :global(h1) {
    font-size: 1.35rem;
  }

  .body :global(h2) {
    font-size: 1.2rem;
  }

  .body :global(h3) {
    font-size: 1.08rem;
  }

  .body :global(h4),
  .body :global(h5),
  .body :global(h6) {
    font-size: 1rem;
  }

  .body :global(ul),
  .body :global(ol) {
    padding-left: 1.35rem;
  }

  .body :global(li + li) {
    margin-top: 0.2rem;
  }

  .body :global(blockquote) {
    padding-left: 0.75rem;
    border-left: 2px solid var(--border-strong);
    color: var(--text-muted);
  }

  .body :global(pre) {
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--border);
    background: var(--bg-input);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .body :global(code) {
    font-family:
      ui-monospace,
      SFMono-Regular,
      Menlo,
      Consolas,
      monospace;
    font-size: 0.92em;
  }

  .body :global(p code),
  .body :global(li code),
  .body :global(blockquote code) {
    padding: 0.08rem 0.25rem;
    border: 1px solid var(--border);
    background: var(--bg-input);
  }

  .body :global(a) {
    color: inherit;
    text-decoration: underline;
  }

  .body :global(hr) {
    margin: 0.7rem 0;
    border: 0;
    border-top: 1px solid var(--border);
  }

  .thoughts {
    margin-top: 0.4rem;
    font-size: 0.8rem;
  }

  .thought-steps {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.4rem;
  }

  .thought-step {
    padding: 0.45rem 0.5rem;
    border: 1px solid var(--border);
    background: rgb(255 255 255 / 0.28);
  }

  .thought-step-title {
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.35rem;
  }

  .thought-section-label {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--text-muted);
    margin-bottom: 0.2rem;
  }

  .thought-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }

  .thought-list-item {
    display: grid;
    gap: 0.2rem;
  }

  .thought-tool-name {
    width: fit-content;
    font-size: 0.74rem;
  }

  .thought-tool-name[data-error="true"] {
    color: #8b1e2d;
  }

  .thought-block {
    margin: 0 0 0.35rem;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    color: var(--text-muted);
  }

  .thought-block-compact {
    margin-bottom: 0;
    padding: 0.35rem 0.45rem;
    background: rgb(255 255 255 / 0.34);
    border: 1px solid var(--border);
  }

  .thought-block[data-error="true"] {
    color: #8b1e2d;
  }
</style>
