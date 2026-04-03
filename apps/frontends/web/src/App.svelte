<script lang="ts">
  import { onMount } from "svelte";
  import type {
    ConversationThread,
    ShellCommandResponse,
    SurfaceBootstrapResponse,
  } from "@clog/types";
  import { ClogApiClient, resolveBackendBaseUrl } from "./clog-api";
  import ChatPanel from "./components/ChatPanel.svelte";
  import ConsolePanel from "./components/ConsolePanel.svelte";
  import Sidebar from "./components/Sidebar.svelte";

  type ConsoleEntryKind = "observation" | "finding" | "health" | "shell" | "info" | "error";

  interface ConsoleEntry {
    readonly id: string;
    readonly at: number;
    readonly kind: ConsoleEntryKind;
    readonly title: string;
    readonly body?: string;
  }

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
  let shellBusy = $state(false);
  let consoleEntries = $state<ConsoleEntry[]>([]);

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

  function selectThread(threadId: string): void {
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

  function formatShellResult(result: ShellCommandResponse): string {
    const lines = [
      `exit ${result.exitCode} · ${result.durationMs} ms`,
      `cwd ${result.workingDirectory}`,
      result.stdout ? `stdout:\n${result.stdout}` : "",
      result.stderr ? `stderr:\n${result.stderr}` : "",
    ].filter(Boolean);
    return lines.join("\n\n");
  }

  async function handleShell(line: string): Promise<void> {
    if (!line.trim()) {
      return;
    }
    shellBusy = true;
    try {
      const trimmed = line.trim();
      const parts = trimmed.split(/\s+/u);
      const command = parts[0] ?? "";
      const args = parts.slice(1);
      const res = await client.runShellCommand({
        command,
        ...(args.length > 0 ? { args } : {}),
      });
      pushConsole({
        kind: "shell",
        title: `$ ${trimmed}`,
        body: formatShellResult(res.result),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushConsole({ kind: "error", title: "Shell request failed", body: msg });
    } finally {
      shellBusy = false;
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
      channels={bootstrap?.channels ?? []}
      integrations={bootstrap?.integrations ?? []}
      capabilities={bootstrap?.capabilities ?? null}
      threads={threadRows}
      {activeThreadId}
      {newThreadTitle}
      {refreshBusy}
      {monitorBusy}
      onNewThreadTitleChange={(value) => {
        newThreadTitle = value;
      }}
      onSelectThread={selectThread}
      onRefresh={refresh}
      onMonitorCycle={monitorCycle}
    />
    <main class="main">
      <ChatPanel activeThread={activeThread} {sending} onSend={(b) => void handleSend(b)} />
    </main>
    <aside class="right">
      <ConsolePanel entries={consoleEntries} {shellBusy} onRunShell={(l) => void handleShell(l)} />
    </aside>
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
    background: #f0f0f0;
    color: #111;
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
    background: #e8e8e8;
    border-bottom: 1px solid #bbb;
  }

  .banner {
    padding: 0.35rem 0.6rem;
    font-size: 0.85rem;
    border-bottom: 1px solid #bbb;
  }

  .banner.error {
    background: #ffe8e8;
    color: #600;
  }

  .layout {
    flex: 1;
    display: flex;
    min-height: 0;
    border-top: 1px solid #999;
  }

  .layout > :global(.side) {
    width: 260px;
    flex-shrink: 0;
    background: #f7f7f7;
    border-right: 1px solid #999;
  }

  .main {
    flex: 1;
    min-width: 0;
    background: #fff;
    display: flex;
    flex-direction: column;
  }

  .right {
    width: 300px;
    flex-shrink: 0;
    background: #fafafa;
    border-left: 1px solid #999;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
</style>
