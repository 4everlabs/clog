<script lang="ts">
  import type {
    RuntimeWakeupConfig,
    RuntimeWakeupPromptDefinition,
    RuntimeWakeupScheduleEntry,
  } from "@clog/types";

  const MAX_PROMPT_LENGTH = 5_000;
  const WAKEUP_TIME_UTC_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const DEFAULT_TIME_UTC = "10:00";

  interface SaveInput {
    readonly enabled: boolean;
    readonly prompts: Readonly<Record<string, RuntimeWakeupPromptDefinition>>;
    readonly schedule: readonly RuntimeWakeupScheduleEntry[];
  }

  interface Props {
    readonly wakeup: RuntimeWakeupConfig | null;
    readonly busy?: boolean;
    readonly error?: string | null;
    readonly onSave: (input: SaveInput) => void | Promise<void>;
  }

  interface PromptRow {
    key: string;
    title: string;
    prompt: string;
  }

  interface ScheduleRow {
    key: string;
    promptKey: string;
    timeUtc: string;
  }

  const props: Props = $props();

  let enabled = $state(false);
  let promptRows = $state<PromptRow[]>([]);
  let scheduleRows = $state<ScheduleRow[]>([]);
  let saveError = $state<string | null>(null);
  let promptErrors = $state<Record<string, string>>({});
  let scheduleErrors = $state<Record<string, string>>({});
  let lastSyncedSource = "";
  let lastEditedDraft = "";

  const busyFlag = $derived(props.busy ?? false);
  const externalError = $derived(props.error ?? null);
  const promptOptions = $derived(
    promptRows.map((row, index) => ({
      key: row.key,
      label: row.title.trim() || `Prompt ${index + 1}`,
    })),
  );
  const sourceDraftSignature = $derived(draftSignature(createDraft(props.wakeup ?? null)));
  const currentDraftSignature = $derived(draftSignature({ enabled, prompts: promptRows, schedule: scheduleRows }));
  const draftIsValid = $derived(previewDraftIsValid(promptRows, scheduleRows));
  const saveDisabled = $derived(busyFlag || !draftIsValid || currentDraftSignature === sourceDraftSignature);

  $effect(() => {
    const signature = wakeupSignature(props.wakeup ?? null);
    if (signature === lastSyncedSource) {
      return;
    }

    const nextDraft = createDraft(props.wakeup ?? null);
    enabled = nextDraft.enabled;
    promptRows = nextDraft.prompts;
    scheduleRows = nextDraft.schedule;
    promptErrors = {};
    scheduleErrors = {};
    saveError = null;
    lastSyncedSource = signature;
  });

  $effect(() => {
    const signature = currentDraftSignature;
    if (!signature || signature === lastEditedDraft) {
      return;
    }

    lastEditedDraft = signature;
    promptErrors = {};
    scheduleErrors = {};
    saveError = null;
  });

  function newKey(prefix: string): string {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  function defaultDraft(): { enabled: boolean; prompts: PromptRow[]; schedule: ScheduleRow[] } {
    const promptKey = newKey("prompt");
    return {
      enabled: true,
      prompts: [{
        key: promptKey,
        title: "",
        prompt: "",
      }],
      schedule: [{
        key: newKey("schedule"),
        promptKey,
        timeUtc: DEFAULT_TIME_UTC,
      }],
    };
  }

  function createDraft(wakeup: RuntimeWakeupConfig | null): { enabled: boolean; prompts: PromptRow[]; schedule: ScheduleRow[] } {
    if (!wakeup || Object.keys(wakeup.prompts).length === 0 || wakeup.schedule.length === 0) {
      return defaultDraft();
    }

    const promptEntries = Object.entries(wakeup.prompts);
    const prompts = promptEntries.map(([, definition]) => ({
      key: newKey("prompt"),
      title: definition.title,
      prompt: definition.prompt,
    }));
    const promptKeyByIndex = new Map(promptEntries.map(([promptId], index) => [promptId, prompts[index]?.key ?? ""]));
    const schedule = wakeup.schedule.map((entry) => ({
      key: newKey("schedule"),
      promptKey: promptKeyByIndex.get(entry.promptId) ?? prompts[0]?.key ?? "",
      timeUtc: entry.timeUtc,
    }));

    return {
      enabled: wakeup.enabled,
      prompts,
      schedule,
    };
  }

  function wakeupSignature(wakeup: RuntimeWakeupConfig | null): string {
    return JSON.stringify(wakeup ?? {
      enabled: true,
      prompts: {},
      schedule: [],
    });
  }

  function draftSignature(draft: {
    enabled: boolean;
    prompts: readonly PromptRow[];
    schedule: readonly ScheduleRow[];
  }): string {
    return JSON.stringify({
      enabled: draft.enabled,
      prompts: draft.prompts.map((row) => ({
        title: row.title.trim(),
        prompt: row.prompt.trim(),
      })),
      schedule: draft.schedule.map((row) => ({
        promptKey: row.promptKey,
        timeUtc: row.timeUtc.trim(),
      })),
    });
  }

  function addPrompt(): void {
    promptRows = [
      ...promptRows,
      {
        key: newKey("prompt"),
        title: "",
        prompt: "",
      },
    ];
    saveError = null;
  }

  function removePrompt(promptKey: string): void {
    const nextPrompts = promptRows.filter((row) => row.key !== promptKey);
    const fallbackPromptKey = nextPrompts[0]?.key ?? "";
    promptRows = nextPrompts;
    scheduleRows = scheduleRows
      .filter((row) => row.promptKey !== promptKey || fallbackPromptKey)
      .map((row) => row.promptKey === promptKey ? { ...row, promptKey: fallbackPromptKey } : row);
    if (promptErrors[promptKey]) {
      const { [promptKey]: _removed, ...rest } = promptErrors;
      promptErrors = rest;
    }
    saveError = null;
  }

  function addSchedule(): void {
    scheduleRows = [
      ...scheduleRows,
      {
        key: newKey("schedule"),
        promptKey: promptRows[0]?.key ?? "",
        timeUtc: DEFAULT_TIME_UTC,
      },
    ];
    saveError = null;
  }

  function removeSchedule(key: string): void {
    scheduleRows = scheduleRows.filter((row) => row.key !== key);
    if (scheduleErrors[key]) {
      const { [key]: _removed, ...rest } = scheduleErrors;
      scheduleErrors = rest;
    }
    saveError = null;
  }

  function validateDraft(): { ok: true; payload: SaveInput } | { ok: false } {
    const nextPromptErrors: Record<string, string> = {};
    const nextScheduleErrors: Record<string, string> = {};

    if (promptRows.length === 0 || scheduleRows.length === 0) {
      promptErrors = nextPromptErrors;
      scheduleErrors = nextScheduleErrors;
      return { ok: false };
    }

    const prompts: Record<string, RuntimeWakeupPromptDefinition> = {};
    const promptIdByKey = new Map<string, string>();
    let promptIndex = 0;

    for (const row of promptRows) {
      const title = row.title.trim();
      const prompt = row.prompt.trim();

      if (!title) {
        nextPromptErrors[row.key] = "Prompt title is required.";
        continue;
      }
      if (!prompt) {
        nextPromptErrors[row.key] = "Prompt text is required.";
        continue;
      }
      if (prompt.length > MAX_PROMPT_LENGTH) {
        nextPromptErrors[row.key] = `Prompt text must be ${MAX_PROMPT_LENGTH} characters or fewer.`;
        continue;
      }

      promptIndex += 1;
      const promptId = `prompt${promptIndex}`;
      promptIdByKey.set(row.key, promptId);
      prompts[promptId] = {
        title,
        prompt,
      };
    }

    const schedule: RuntimeWakeupScheduleEntry[] = [];
    for (const row of scheduleRows) {
      const promptId = promptIdByKey.get(row.promptKey);
      const timeUtc = row.timeUtc.trim();

      if (!promptId) {
        nextScheduleErrors[row.key] = "Choose a prompt.";
        continue;
      }
      if (!WAKEUP_TIME_UTC_PATTERN.test(timeUtc)) {
        nextScheduleErrors[row.key] = "Time must be in HH:MM UTC.";
        continue;
      }

      schedule.push({
        promptId,
        timeUtc,
      });
    }

    promptErrors = nextPromptErrors;
    scheduleErrors = nextScheduleErrors;
    if (Object.keys(nextPromptErrors).length > 0 || Object.keys(nextScheduleErrors).length > 0 || schedule.length === 0) {
      return { ok: false };
    }

    return {
      ok: true,
      payload: {
        enabled,
        prompts,
        schedule,
      },
    };
  }

  function previewDraftIsValid(
    prompts: readonly PromptRow[],
    schedule: readonly ScheduleRow[],
  ): boolean {
    if (prompts.length === 0 || schedule.length === 0) {
      return false;
    }

    const promptKeys = new Set<string>();
    for (const row of prompts) {
      if (!row.title.trim() || !row.prompt.trim() || row.prompt.trim().length > MAX_PROMPT_LENGTH) {
        return false;
      }
      promptKeys.add(row.key);
    }

    return schedule.every((row) => promptKeys.has(row.promptKey) && WAKEUP_TIME_UTC_PATTERN.test(row.timeUtc.trim()));
  }

  async function handleSave(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    saveError = null;
    const validation = validateDraft();
    if (!validation.ok) {
      saveError = "Fix the highlighted entries before saving.";
      return;
    }

    await props.onSave(validation.payload);
  }
</script>

<section class="wakeup-panel" aria-label="Wakeup schedule">
  <header class="header">
    <h1>Wakeup Schedule</h1>
    <p class="subtitle">Wakeups will fire daily until you turn it off.</p>
  </header>

  <form class="form" onsubmit={(event) => void handleSave(event)}>
    <section class="toggle-row">
      <label class="toggle-label">
        <span class="field-label">Wakeups Enabled</span>
        <input type="checkbox" bind:checked={enabled} />
      </label>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Prompts</h2>
        <button type="button" class="secondary-button" onclick={addPrompt} disabled={busyFlag}>Add prompt</button>
      </div>

      <div class="rows">
        {#each promptRows as row (row.key)}
          <article class="row">
            <div class="row-grid prompts-grid">
              <label class="field">
                <span class="field-label">Prompt Title</span>
                <input
                  type="text"
                  bind:value={row.title}
                  placeholder="Morning check"
                />
              </label>

              <button
                type="button"
                class="delete-button"
                onclick={() => removePrompt(row.key)}
                aria-label="Delete prompt"
              >
                Delete
              </button>
            </div>

            <label class="field prompt-field">
              <span class="field-label">
                Prompt
                <span class="char-count" data-over={row.prompt.length > MAX_PROMPT_LENGTH}>
                  {row.prompt.length} / {MAX_PROMPT_LENGTH}
                </span>
              </span>
              <textarea
                bind:value={row.prompt}
                rows="3"
                maxlength={MAX_PROMPT_LENGTH}
                placeholder="Check in."
              ></textarea>
            </label>

            {#if promptErrors[row.key]}
              <p class="error-text" role="alert">{promptErrors[row.key]}</p>
            {/if}
          </article>
        {/each}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Schedule</h2>
        <button type="button" class="secondary-button" onclick={addSchedule} disabled={busyFlag}>Add time</button>
      </div>

      <div class="rows">
        {#each scheduleRows as row (row.key)}
          <article class="row">
            <div class="row-grid schedule-grid">
              <label class="field">
                <span class="field-label">Prompt</span>
                <select bind:value={row.promptKey}>
                  <option value="" disabled>Select prompt</option>
                  {#each promptOptions as option (option.key)}
                    <option value={option.key}>{option.label}</option>
                  {/each}
                </select>
              </label>

              <label class="field">
                <span class="field-label">Time (UTC)</span>
                <input
                  type="time"
                  bind:value={row.timeUtc}
                  step="60"
                />
              </label>

              <button
                type="button"
                class="delete-button"
                onclick={() => removeSchedule(row.key)}
                aria-label="Delete schedule row"
              >
                Delete
              </button>
            </div>

            {#if scheduleErrors[row.key]}
              <p class="error-text" role="alert">{scheduleErrors[row.key]}</p>
            {/if}
          </article>
        {/each}
      </div>
    </section>

    <div class="actions">
      <button type="submit" class="primary-button" disabled={saveDisabled}>
        {busyFlag ? "Saving..." : "Save schedule"}
      </button>
    </div>

    {#if saveError}
      <p class="error-text" role="alert">{saveError}</p>
    {/if}
    {#if externalError}
      <p class="error-text" role="alert">{externalError}</p>
    {/if}
  </form>
</section>

<style>
  .wakeup-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem 1.25rem;
    overflow: auto;
    height: 100%;
    color: var(--text-primary);
  }

  .header h1,
  .section h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .section h2 {
    font-size: 0.92rem;
  }

  .subtitle {
    margin: 0.25rem 0 0;
    color: var(--text-muted);
    font-size: 0.82rem;
  }

  .form,
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .toggle-row {
    padding: 0.75rem;
    border: 1px solid var(--border);
    background: var(--bg-panel);
  }

  .toggle-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }

  .rows {
    display: grid;
    gap: 0.75rem;
  }

  .row {
    border: 1px solid var(--border);
    background: var(--bg-panel);
    padding: 0.75rem;
    display: grid;
    gap: 0.6rem;
  }

  .row-grid {
    display: grid;
    gap: 0.6rem;
    align-items: end;
  }

  .prompts-grid {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .schedule-grid {
    grid-template-columns: minmax(0, 1fr) minmax(180px, 220px) auto;
  }

  @media (max-width: 820px) {
    .prompts-grid,
    .schedule-grid {
      grid-template-columns: 1fr;
    }
  }

  .field {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }

  .field-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--text-muted);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .char-count {
    font-size: 0.7rem;
    color: var(--text-subtle);
    font-weight: normal;
    text-transform: none;
    letter-spacing: normal;
  }

  .char-count[data-over="true"] {
    color: #7a2832;
  }

  .field input,
  .field textarea,
  .field select {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--border);
    background: var(--bg-input);
    color: var(--text-primary);
    font: inherit;
    padding: 0.42rem 0.55rem;
    border-radius: 0;
  }

  .field textarea {
    min-height: 4.75rem;
    resize: vertical;
    line-height: 1.35;
  }

  .prompt-field {
    margin-top: 0.1rem;
  }

  .actions {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
  }

  .primary-button,
  .secondary-button,
  .delete-button {
    font: inherit;
    border: 1px solid var(--border);
    background: var(--bg-panel-alt);
    color: var(--text-primary);
    padding: 0.5rem 0.85rem;
    cursor: pointer;
    border-radius: 0;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease,
      opacity 0.15s ease;
  }

  .primary-button {
    background: var(--accent-strong);
    border-color: var(--accent-strong);
  }

  .primary-button:hover:not(:disabled) {
    filter: brightness(0.97);
  }

  .primary-button:disabled,
  .secondary-button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .secondary-button:hover:not(:disabled) {
    background: var(--accent);
  }

  .delete-button {
    align-self: end;
    background: transparent;
    color: #7a2832;
    border-color: #c78189;
    padding: 0.4rem 0.7rem;
  }

  .delete-button:hover {
    background: #f3dcdf;
  }

  .error-text {
    margin: 0;
    color: #7a2832;
    font-size: 0.78rem;
    line-height: 1.3;
  }
</style>
