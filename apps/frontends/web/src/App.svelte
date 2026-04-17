<script lang="ts">
  import { onMount } from "svelte";
  import type { ConversationMessage, ConversationThread, SurfaceBootstrapResponse } from "@clog/types";
  import { ClogApiClient, resolveBackendBaseUrl } from "./clog-api";
  import ChatPanel from "./components/ChatPanel.svelte";
  import ConsolePanel from "./components/ConsolePanel.svelte";
  import SettingsPanel from "./components/SettingsPanel.svelte";
  import Sidebar from "./components/Sidebar.svelte";

  type ConsoleEntryKind = "observation" | "finding" | "health" | "info" | "error";

  interface ConsoleEntry {
    readonly id: string;
    readonly at: number;
    readonly kind: ConsoleEntryKind;
    readonly title: string;
    readonly body?: string;
  }

  type MainView = "chat" | "settings";
  type ThreadSelectionMode = "auto" | "existing" | "new";
  interface ThreadSnapshot {
    readonly threads: ConversationThread[];
    readonly activeThreadId: string | null;
    readonly selectionMode: ThreadSelectionMode;
  }
  interface LoadThreadsOptions {
    readonly initial?: boolean;
    readonly reportError?: boolean;
    readonly skipIfSending?: boolean;
  }
  interface WakeupFormInput {
    readonly intervalMinutes: number;
    readonly message: string;
  }

  const CHAT_CHANNEL: ConversationThread["channel"] = "web";
  const CHAT_POLL_INTERVAL_MS = 900;

  const { baseUrl, sessionStartedAt = null }: {
    readonly baseUrl?: string;
    readonly sessionStartedAt?: number | null;
  } = $props();

  const client = $derived(
    new ClogApiClient({
      baseUrl: baseUrl?.trim() || resolveBackendBaseUrl(),
    }),
  );

  let bootstrap = $state<SurfaceBootstrapResponse | null>(null);
  let threads = $state<ConversationThread[]>([]);
  let activeThreadId = $state<string | null>(null);
  let loading = $state(true);
  let refreshBusy = $state(false);
  let monitorBusy = $state(false);
  let wakeupSaveBusy = $state(false);
  let sending = $state(false);
  let consoleEntries = $state<ConsoleEntry[]>([]);
  let activeView = $state<MainView>("chat");
  let threadSelectionMode = $state<ThreadSelectionMode>("auto");
  let threadsError = $state<string | null>(null);
  let bootstrapError = $state<string | null>(null);
  let wakeupSaveError = $state<string | null>(null);
  let sendError = $state<string | null>(null);
  let threadStateVersion = 0;

  const loadError = $derived.by(() => {
    const messages = [sendError, threadsError, bootstrapError].filter((value): value is string => value !== null);
    return messages.length > 0 ? messages.join(" | ") : null;
  });
  const activeThread = $derived(threads.find((t) => t.id === activeThreadId) ?? null);

  function pushConsole(entry: Omit<ConsoleEntry, "id" | "at"> & { readonly id?: string }): void {
    const id = entry.id ?? crypto.randomUUID();
    const row: ConsoleEntry = {
      id,
      at: Date.now(),
      kind: entry.kind,
      title: entry.title,
      ...(entry.body !== undefined ? { body: entry.body } : {}),
    };
    consoleEntries = [...consoleEntries, row].slice(-200);
  }

  function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function summarizeThreadTitle(body: string): string {
    const text = body.replace(/\s+/gu, " ").trim();
    return text.slice(0, 80) || "New conversation";
  }

  function createOptimisticMessage(role: ConversationMessage["role"], content: string, createdAt: number): ConversationMessage {
    return {
      id: `optimistic-${role}-${crypto.randomUUID()}`,
      role,
      channel: CHAT_CHANNEL,
      content,
      createdAt,
    };
  }

  function resolveActiveThreadId(
    next: readonly ConversationThread[],
    preferredThreadId: string | null,
    selectionMode: ThreadSelectionMode,
  ): string | null {
    if (selectionMode === "new") {
      return null;
    }
    if (preferredThreadId && next.some((thread) => thread.id === preferredThreadId)) {
      return preferredThreadId;
    }
    return next[0]?.id ?? null;
  }

  function setThreadsFromServer(next: readonly ConversationThread[]): void {
    const nextThreads = [...next];
    threads = nextThreads;
    activeThreadId = resolveActiveThreadId(nextThreads, activeThreadId, threadSelectionMode);
    threadStateVersion += 1;
  }

  function setLocalThreadState(
    next: readonly ConversationThread[],
    nextActiveThreadId: string | null,
    nextSelectionMode: ThreadSelectionMode = threadSelectionMode,
  ): void {
    threads = [...next];
    activeThreadId = nextActiveThreadId;
    threadSelectionMode = nextSelectionMode;
    threadStateVersion += 1;
  }

  function upsertThread(
    updated: ConversationThread,
    replaceThreadId: string | null = null,
    nextSelectionMode: ThreadSelectionMode = "existing",
  ): void {
    const next = threads.slice();

    if (replaceThreadId) {
      const replaceIndex = next.findIndex((thread) => thread.id === replaceThreadId);
      if (replaceIndex >= 0) {
        next[replaceIndex] = updated;
        setLocalThreadState(next, updated.id, nextSelectionMode);
        return;
      }
    }

    const index = next.findIndex((thread) => thread.id === updated.id);
    if (index >= 0) {
      next[index] = updated;
    } else {
      next.push(updated);
    }
    setLocalThreadState(next, updated.id, nextSelectionMode);
  }

  async function loadThreads({
    initial = false,
    reportError = true,
    skipIfSending = false,
  }: LoadThreadsOptions = {}): Promise<boolean> {
    const requestVersion = threadStateVersion;

    if (initial) {
      loading = true;
    }

    try {
      const response = await client.listThreads();
      if ((skipIfSending && sending) || requestVersion !== threadStateVersion) {
        return false;
      }

      threadsError = null;
      setThreadsFromServer(response.threads);
      return true;
    } catch (error) {
      const message = describeError(error);
      threadsError = message;
      if (reportError) {
        pushConsole({ kind: "error", title: "Thread refresh failed", body: message });
      }
      return false;
    } finally {
      if (initial) {
        loading = false;
      }
    }
  }

  async function loadBootstrap(reportError = true): Promise<boolean> {
    try {
      bootstrap = await client.bootstrap();
      bootstrapError = null;
      return true;
    } catch (error) {
      const message = describeError(error);
      bootstrapError = message;
      if (reportError) {
        pushConsole({ kind: "error", title: "Bootstrap refresh failed", body: message });
      }
      return false;
    }
  }

  onMount(() => {
    void loadThreads({ initial: true });
    void loadBootstrap();

    const pollId = window.setInterval(() => {
      if (activeView !== "chat" || sending || threadSelectionMode === "new") {
        return;
      }
      void loadThreads({ reportError: false, skipIfSending: true });
    }, CHAT_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollId);
    };
  });

  async function refresh(): Promise<void> {
    refreshBusy = true;
    try {
      await Promise.all([loadThreads({ skipIfSending: true }), loadBootstrap()]);
    } finally {
      refreshBusy = false;
    }
  }

  async function monitorCycle(): Promise<void> {
    monitorBusy = true;
    try {
      const r = await client.runMonitorCycle();
      pushConsole({
        kind: "info",
        title: `Monitor tick at ${new Date(r.checkedAt).toISOString()}`,
      });
      for (const obs of r.observations) {
        pushConsole({
          kind: "observation",
          title: obs.summary,
          body: obs.details,
        });
      }
      for (const f of r.findings) {
        pushConsole({
          kind: "finding",
          title: f.title,
          body: f.summary,
        });
      }
      for (const h of r.integrationHealth) {
        pushConsole({
          kind: "health",
          title: `${h.kind}: ${h.status}`,
          body: h.summary,
        });
      }
      await Promise.all([loadBootstrap(), loadThreads({ skipIfSending: true })]);
    } catch (error) {
      const message = describeError(error);
      pushConsole({ kind: "error", title: "Monitor cycle failed", body: message });
    } finally {
      monitorBusy = false;
    }
  }

  async function handleWakeupSave(input: WakeupFormInput): Promise<void> {
    const intervalMinutes = Math.floor(input.intervalMinutes);
    const message = input.message.trim();

    if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1 || !message) {
      wakeupSaveError = "Enter a valid interval and prompt.";
      return;
    }

    wakeupSaveBusy = true;
    wakeupSaveError = null;
    try {
      const response = await client.updateWakeupConfig({
        intervalMs: intervalMinutes * 60_000,
        message,
      });

      if (bootstrap) {
        bootstrap = { ...bootstrap, wakeup: response.wakeup };
      } else {
        await loadBootstrap(false);
      }

      pushConsole({
        kind: "info",
        title: "Wakeup updated",
        body: `Every ${response.wakeup.intervalMs / 60_000} min`,
      });
    } catch (error) {
      const messageText = describeError(error);
      wakeupSaveError = messageText;
      pushConsole({ kind: "error", title: "Wakeup save failed", body: messageText });
    } finally {
      wakeupSaveBusy = false;
    }
  }

  function selectThread(threadId: string | null): void {
    activeThreadId = threadId;
    threadSelectionMode = threadId === null ? "new" : "existing";
    if (threadId !== null) {
      void loadThreads({ reportError: false, skipIfSending: true });
    }
  }

  function handleSelectView(view: MainView): void {
    activeView = view;
    if (view === "chat") {
      void loadThreads({ reportError: false, skipIfSending: true });
    }
  }

  async function handleSend(body: string): Promise<void> {
    const message = body.trim();
    if (!message) {
      return;
    }

    const previousState: ThreadSnapshot = {
      threads: $state.snapshot(threads),
      activeThreadId,
      selectionMode: threadSelectionMode,
    };
    const currentThread = activeThread;
    const currentThreadId = activeThreadId;
    const now = Date.now();
    const optimisticUserMessage = createOptimisticMessage("user", message, now);
    const optimisticAgentMessage = createOptimisticMessage("agent", "Thinking...", now + 1);
    const optimisticThreadId = currentThreadId ?? `optimistic-thread-${crypto.randomUUID()}`;
    const optimisticThread: ConversationThread = currentThread
      ? {
          ...currentThread,
          title: currentThread.title || summarizeThreadTitle(message),
          updatedAt: now,
          messages: [...currentThread.messages, optimisticUserMessage, optimisticAgentMessage],
        }
      : {
          id: optimisticThreadId,
          title: summarizeThreadTitle(message),
          channel: CHAT_CHANNEL,
          createdAt: now,
          updatedAt: now,
          messages: [optimisticUserMessage, optimisticAgentMessage],
        };
    const optimisticThreads = currentThread
      ? threads.map((thread) => (thread.id === currentThread.id ? optimisticThread : thread))
      : [...previousState.threads, optimisticThread];

    sendError = null;
    setLocalThreadState(optimisticThreads, optimisticThread.id, "existing");
    sending = true;

    try {
      const res = await client.sendMessage({
        channel: CHAT_CHANNEL,
        threadId: currentThreadId ?? undefined,
        message,
      });

      sendError = null;
      upsertThread(res.thread, currentThreadId ? null : optimisticThread.id, "existing");
      pushConsole({
        kind: "info",
        title: "Message sent",
        body: `Thread ${res.thread.id}`,
      });
    } catch (error) {
      const messageText = describeError(error);
      sendError = messageText;
      setLocalThreadState(previousState.threads, previousState.activeThreadId, previousState.selectionMode);
      pushConsole({ kind: "error", title: "Send failed", body: messageText });
    } finally {
      sending = false;
    }
  }

  const threadRows = $derived(
    threads.map((t) => ({
      id: t.id,
      title: t.title,
      channel: t.channel,
      updatedAt: t.updatedAt,
    })),
  );
</script>

<div class="app-root">
  {#if loading}
    <div class="loading" role="status">Loading…</div>
  {/if}
  {#if loadError}
    <div class="load-error-banner" role="alert">{loadError}</div>
  {/if}

  <div class="layout">
    <Sidebar
      runtime={bootstrap?.runtime ?? null}
      wakeup={bootstrap?.wakeup ?? null}
      {sessionStartedAt}
      activeView={activeView}
      {wakeupSaveBusy}
      {wakeupSaveError}
      onSelectView={handleSelectView}
      onSaveWakeup={(input: WakeupFormInput) => void handleWakeupSave(input)}
    />
    <main class="main">
      {#if activeView === "chat"}
        <div class="chat-layout">
          <div class="chat-column">
            <ChatPanel
              activeThread={activeThread}
              threads={threadRows}
              {activeThreadId}
              {sending}
              onSend={(body) => void handleSend(body)}
              onSelectThread={selectThread}
            />
          </div>

          <aside class="right">
            <ConsolePanel entries={consoleEntries} />
          </aside>
        </div>
      {:else}
        <SettingsPanel
          runtime={bootstrap?.runtime ?? null}
          integrations={bootstrap?.integrations ?? []}
          capabilities={bootstrap?.capabilities ?? null}
          entries={consoleEntries}
          {refreshBusy}
          {monitorBusy}
          onRefresh={refresh}
          onMonitorCycle={monitorCycle}
        />
      {/if}
    </main>
  </div>
</div>

<style>
  :global(html, body, #app) {
    height: 100%;
    margin: 0;
  }

  :global(body) {
    font-family:
      system-ui,
      -apple-system,
      Segoe UI,
      Roboto,
      sans-serif;
    color-scheme: light;
    --bg-page: #e8ecef;
    --bg-sidebar: #e3e7eb;
    --bg-main: #f1f4f7;
    --bg-panel: #e8edf2;
    --bg-panel-alt: #dce3ea;
    --bg-input: #f3f6f9;
    --border: #c0c9d3;
    --border-strong: #aeb9c4;
    --text-primary: #111111;
    --text-muted: #434d5a;
    --text-subtle: #5b6573;
    --accent: #d2dae3;
    --accent-strong: #c6d0dc;
    background: var(--bg-page);
    color: var(--text-primary);
  }

  .app-root {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .loading {
    padding: 0.35rem 0.6rem;
    font-size: 0.85rem;
    background: var(--bg-panel-alt);
    border-bottom: 1px solid var(--border);
  }

  .load-error-banner {
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 0.75rem);
    left: 50%;
    z-index: 1000;
    width: min(48rem, calc(100vw - 1.5rem));
    transform: translateX(-50%);
    padding: 0.35rem 0.6rem;
    font-size: 0.85rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    box-shadow: 0 10px 24px rgb(17 17 17 / 12%);
    background: #f3dcdf;
    color: #5f1f27;
  }

  .layout {
    flex: 1;
    display: flex;
    min-height: 0;
    border-top: 1px solid var(--border-strong);
  }

  .layout > :global(.side) {
    width: 148px;
    flex-shrink: 0;
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border-strong);
  }

  .main {
    flex: 1;
    min-width: 0;
    background: var(--bg-main);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .chat-layout {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  .chat-column {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .right {
    width: min(450px, 50%);
    flex-shrink: 0;
    background: var(--bg-sidebar);
    border-left: 1px solid var(--border-strong);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
</style>
