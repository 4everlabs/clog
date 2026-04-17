<script lang="ts">
  import { onMount } from "svelte";
  import type { ConversationThread, SurfaceBootstrapResponse } from "@clog/types";
  import { ClogApiClient, resolveBackendBaseUrl } from "./clog-api";
  import ChatPanel from "./components/ChatPanel.svelte";
  import ConsolePanel from "./components/ConsolePanel.svelte";
  import SettingsPanel from "./components/SettingsPanel.svelte";
  import Sidebar from "./components/Sidebar.svelte";

  type ConsoleEntryKind = "observation" | "finding" | "health" | "shell" | "info" | "error";

  interface ConsoleEntry {
    readonly id: string;
    readonly at: number;
    readonly kind: ConsoleEntryKind;
    readonly title: string;
    readonly body?: string;
  }

  type MainView = "chat" | "settings";

  const { baseUrl }: { readonly baseUrl?: string } = $props();

  const client = $derived(
    new ClogApiClient({
      baseUrl: baseUrl?.trim() || resolveBackendBaseUrl(),
    }),
  );

  let bootstrap = $state<SurfaceBootstrapResponse | null>(null);
  let threads = $state<ConversationThread[]>([]);
  let activeThreadId = $state<string | null>(null);
  let newThreadTitle = $state("");
  let loadError = $state<string | null>(null);
  let loading = $state(true);
  let refreshBusy = $state(false);
  let monitorBusy = $state(false);
  let sending = $state(false);
  let consoleEntries = $state<ConsoleEntry[]>([]);
  let activeView = $state<MainView>("chat");
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

  function syncActiveAfterThreads(next: readonly ConversationThread[]): void {
    const prev = activeThreadId;
    if (prev && next.some((t) => t.id === prev)) {
      activeThreadId = prev;
      return;
    }
    activeThreadId = next[0]?.id ?? null;
  }

  async function loadAll(isInitial: boolean): Promise<void> {
    loadError = null;
    if (isInitial) {
      loading = true;
    }
    try {
      const [b, t] = await Promise.all([client.bootstrap(), client.listThreads()]);
      bootstrap = b;
      threads = [...t.threads];
      syncActiveAfterThreads(threads);
      pushConsole({ kind: "info", title: "Loaded bootstrap and threads" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      loadError = msg;
      pushConsole({ kind: "error", title: "Load failed", body: msg });
    } finally {
      if (isInitial) {
        loading = false;
      }
    }
  }

  onMount(() => {
    void loadAll(true);
  });

  async function refresh(): Promise<void> {
    refreshBusy = true;
    try {
      await loadAll(false);
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
      const b = await client.bootstrap();
      bootstrap = b;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushConsole({ kind: "error", title: "Monitor cycle failed", body: msg });
    } finally {
      monitorBusy = false;
    }
  }

  function selectThread(threadId: string | null): void {
    activeThreadId = threadId;
  }

  function mergeThread(updated: ConversationThread): void {
    const idx = threads.findIndex((t) => t.id === updated.id);
    if (idx >= 0) {
      const next = threads.slice();
      next[idx] = updated;
      threads = next;
      return;
    }
    threads = [...threads, updated];
  }

  async function handleSend(body: string): Promise<void> {
    if (!body.trim()) {
      return;
    }
    sending = true;
    try {
      const res = await client.sendMessage({
        channel: "web",
        threadId: activeThreadId ?? undefined,
        title: newThreadTitle.trim() || undefined,
        message: body.trim(),
      });
      mergeThread(res.thread);
      activeThreadId = res.thread.id;
      newThreadTitle = "";
      pushConsole({
        kind: "info",
        title: "Message sent",
        body: `Thread ${res.thread.id}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushConsole({ kind: "error", title: "Send failed", body: msg });
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
    <div class="banner error" role="alert">{loadError}</div>
  {/if}

  <div class="layout">
    <Sidebar
      runtime={bootstrap?.runtime ?? null}
      integrations={bootstrap?.integrations ?? []}
      threadCount={threads.length}
      activeView={activeView}
      onSelectView={(view: MainView) => {
        activeView = view;
      }}
    />
    <main class="main">
      {#if activeView === "chat"}
        <div class="chat-layout">
          <div class="chat-column">
            <ChatPanel
              activeThread={activeThread}
              threads={threadRows}
              {activeThreadId}
              {newThreadTitle}
              {sending}
              onSend={(body) => void handleSend(body)}
              onSelectThread={selectThread}
              onNewThreadTitleChange={(value: string) => {
                newThreadTitle = value;
              }}
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

  .banner {
    padding: 0.35rem 0.6rem;
    font-size: 0.85rem;
    border-bottom: 1px solid var(--border);
  }

  .banner.error {
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
    width: 220px;
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
    width: 300px;
    flex-shrink: 0;
    background: var(--bg-sidebar);
    border-left: 1px solid var(--border-strong);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
</style>
