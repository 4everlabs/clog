const asRecord = (value: unknown): Record<string, unknown> | null => {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
};

const toStringValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
};

const toNumberValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const toBooleanValue = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "enabled", "active"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "disabled", "inactive"].includes(normalized)) {
      return false;
    }
  }

  return null;
};

const pickString = (record: Record<string, unknown> | null, keys: readonly string[]): string | null => {
  for (const key of keys) {
    const value = toStringValue(record?.[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
};

const pickNumber = (record: Record<string, unknown> | null, keys: readonly string[]): number | null => {
  for (const key of keys) {
    const value = toNumberValue(record?.[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
};

const pickBoolean = (record: Record<string, unknown> | null, keys: readonly string[]): boolean | null => {
  for (const key of keys) {
    const value = toBooleanValue(record?.[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
};

const extractArray = (value: unknown, keys: readonly string[]): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  for (const key of keys) {
    if (Array.isArray(record[key])) {
      return [...record[key] as unknown[]];
    }
  }

  for (const nestedKey of ["results", "data", "payload"]) {
    const nested = asRecord(record[nestedKey]);
    if (!nested) {
      continue;
    }
    for (const key of keys) {
      if (Array.isArray(nested[key])) {
        return [...nested[key] as unknown[]];
      }
    }
  }

  return [];
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => toStringValue(entry))
    .filter((entry): entry is string => entry !== null);
};

const getTextSummary = (result: { readonly text: string; readonly structuredContent?: unknown }): string | undefined => {
  const trimmed = result.text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const stripWrappedQuotes = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && (
    (trimmed.startsWith("\"") && trimmed.endsWith("\""))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  )) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
};

const extractTextField = (block: string, fieldName: string): string | null => {
  const match = block.match(new RegExp(`^ {4}${fieldName}: (.+)$`, "m"));
  return match?.[1] ? stripWrappedQuotes(match[1]) : null;
};

const extractTopLevelTextBlocks = (text: string): string[] => {
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of text.split("\n")) {
    if (line.startsWith("  - ")) {
      if (current.length > 0) {
        blocks.push(current.join("\n"));
      }
      current = [line];
      continue;
    }

    if (current.length > 0 && (line.startsWith("    ") || line.trim() === "")) {
      current.push(line);
      continue;
    }

    if (current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
  }

  if (current.length > 0) {
    blocks.push(current.join("\n"));
  }

  return blocks;
};

const extractCountFromText = (text: string): number | null => {
  const match = text.match(/^count:\s+(\d+)$/m);
  return match?.[1] ? toNumberValue(match[1]) : null;
};

export const normalizePostHogEntityList = (
  result: { readonly text: string; readonly structuredContent?: unknown },
  keys: readonly string[],
): {
  readonly text?: string;
  readonly total: number;
  readonly entities: ReadonlyArray<{
    readonly id: string | null;
    readonly type: string | null;
    readonly name: string | null;
    readonly description: string | null;
    readonly url: string | null;
    readonly raw: unknown;
  }>;
} => {
  const rows = extractArray(result.structuredContent, keys);

  return {
    text: getTextSummary(result),
    total: rows.length,
    entities: rows.map((row) => {
      const record = asRecord(row);
      return {
        id: pickString(record, ["id", "pk", "key"]),
        type: pickString(record, ["type", "kind"]),
        name: pickString(record, ["name", "title", "derived_name", "key"]),
        description: pickString(record, ["description", "summary", "content", "snippet"]),
        url: pickString(record, ["url", "href", "_posthogUrl", "_posthog_url"]),
        raw: row,
      };
    }),
  };
};

export const normalizePostHogDashboardList = (
  result: { readonly text: string; readonly structuredContent?: unknown },
) => {
  const structuredRecord = asRecord(result.structuredContent);
  const structuredRows = extractArray(result.structuredContent, ["dashboards", "results", "items", "data"]);
  const rows = structuredRows.length > 0 ? structuredRows : extractTopLevelTextBlocks(result.text);
  return {
    text: getTextSummary(result),
    total: pickNumber(structuredRecord, ["count", "total"]) ?? extractCountFromText(result.text) ?? rows.length,
    dashboards: rows.map((row) => {
      if (typeof row === "string") {
        return {
          id: row.match(/^  - id: (.+)$/m)?.[1]?.trim() ?? null,
          name: extractTextField(row, "name"),
          description: extractTextField(row, "description"),
          url: extractTextField(row, "url"),
          tags: [],
          raw: row,
        };
      }

      const record = asRecord(row);
      return {
        id: pickString(record, ["id"]),
        name: pickString(record, ["name", "title"]),
        description: pickString(record, ["description"]),
        url: pickString(record, ["url", "href"]),
        tags: toStringArray(record?.tags),
        raw: row,
      };
    }),
  };
};

export const normalizePostHogDashboard = (
  result: { readonly text: string; readonly structuredContent?: unknown },
) => {
  const dashboardRecord = asRecord(result.structuredContent)
    ?? asRecord(extractArray(result.structuredContent, ["dashboards", "results", "items"])[0]);

  return {
    text: getTextSummary(result),
    dashboard: dashboardRecord
      ? {
          id: pickString(dashboardRecord, ["id"]),
          name: pickString(dashboardRecord, ["name", "title"]),
          description: pickString(dashboardRecord, ["description"]),
          url: pickString(dashboardRecord, ["url", "href"]),
          tags: toStringArray(dashboardRecord.tags),
          raw: dashboardRecord,
        }
      : null,
  };
};

export const normalizePostHogInsightList = (
  result: { readonly text: string; readonly structuredContent?: unknown },
) => {
  const rows = extractArray(result.structuredContent, ["insights", "results", "items", "data"]);
  return {
    text: getTextSummary(result),
    total: rows.length,
    insights: rows.map((row) => {
      const record = asRecord(row);
      return {
        id: pickString(record, ["id", "short_id"]),
        name: pickString(record, ["name", "derived_name", "title"]),
        description: pickString(record, ["description"]),
        queryKind: pickString(asRecord(record?.query), ["kind"]),
        url: pickString(record, ["url", "href"]),
        raw: row,
      };
    }),
  };
};

export const normalizePostHogInsight = (
  result: { readonly text: string; readonly structuredContent?: unknown },
) => {
  const insightRecord = asRecord(result.structuredContent)
    ?? asRecord(extractArray(result.structuredContent, ["insights", "results", "items"])[0]);

  return {
    text: getTextSummary(result),
    insight: insightRecord
      ? {
          id: pickString(insightRecord, ["id", "short_id"]),
          name: pickString(insightRecord, ["name", "derived_name", "title"]),
          description: pickString(insightRecord, ["description"]),
          queryKind: pickString(asRecord(insightRecord.query), ["kind"]),
          url: pickString(insightRecord, ["url", "href"]),
          raw: insightRecord,
        }
      : null,
  };
};

export const normalizePostHogFeatureFlags = (
  result: { readonly text: string; readonly structuredContent?: unknown },
) => {
  const rows = extractArray(result.structuredContent, ["flags", "feature_flags", "results", "items", "data"]);
  return {
    text: getTextSummary(result),
    total: rows.length,
    flags: rows.map((row) => {
      const record = asRecord(row);
      return {
        id: pickString(record, ["id"]),
        key: pickString(record, ["key", "feature_flag_key"]),
        name: pickString(record, ["name", "key"]),
        status: pickString(record, ["status"]),
        active: pickBoolean(record, ["active", "is_active", "enabled"]),
        rolloutPercentage: pickNumber(record, ["rollout_percentage", "rolloutPercentage"]),
        url: pickString(record, ["url", "href"]),
        raw: row,
      };
    }),
  };
};

export const normalizePostHogFeatureFlag = (
  result: { readonly text: string; readonly structuredContent?: unknown },
) => {
  const record = asRecord(result.structuredContent)
    ?? asRecord(extractArray(result.structuredContent, ["flags", "feature_flags", "results"])[0]);

  return {
    text: getTextSummary(result),
    flag: record
      ? {
          id: pickString(record, ["id"]),
          key: pickString(record, ["key", "feature_flag_key"]),
          name: pickString(record, ["name", "key"]),
          status: pickString(record, ["status"]),
          active: pickBoolean(record, ["active", "is_active", "enabled"]),
          rolloutPercentage: pickNumber(record, ["rollout_percentage", "rolloutPercentage"]),
          url: pickString(record, ["url", "href"]),
          raw: record,
        }
      : null,
  };
};

export const normalizePostHogFeatureFlagStatus = (
  result: { readonly text: string; readonly structuredContent?: unknown },
) => {
  const record = asRecord(result.structuredContent);
  return {
    text: getTextSummary(result),
    flagId: pickString(record, ["id", "feature_flag_id", "featureFlagId"]),
    status: pickString(record, ["status", "rollout_status", "evaluation_status"]),
    enabled: pickBoolean(record, ["enabled", "is_enabled", "active"]),
    summary: pickString(record, ["summary", "description"]),
    raw: result.structuredContent,
  };
};

export const normalizePostHogFeatureFlagBlastRadius = (
  result: { readonly text: string; readonly structuredContent?: unknown },
) => {
  const record = asRecord(result.structuredContent);
  return {
    text: getTextSummary(result),
    flagId: pickString(record, ["id", "feature_flag_id", "featureFlagId"]),
    estimatedAffectedUsers: pickNumber(record, ["affected_users", "affectedUsers", "blast_radius", "count"]),
    summary: pickString(record, ["summary", "description"]),
    raw: result.structuredContent,
  };
};

export const normalizePostHogExperiments = (
  result: { readonly text: string; readonly structuredContent?: unknown },
) => {
  const rows = extractArray(result.structuredContent, ["experiments", "results", "items", "data"]);
  return {
    text: getTextSummary(result),
    total: rows.length,
    experiments: rows.map((row) => {
      const record = asRecord(row);
      return {
        id: pickString(record, ["id"]),
        name: pickString(record, ["name"]),
        status: pickString(record, ["status", "phase"]),
        featureFlagKey: pickString(record, ["feature_flag_key", "flag_key"]),
        startDate: pickString(record, ["start_date", "startDate"]),
        endDate: pickString(record, ["end_date", "endDate"]),
        url: pickString(record, ["url", "href"]),
        raw: row,
      };
    }),
  };
};

export const normalizePostHogExperiment = (
  result: { readonly text: string; readonly structuredContent?: unknown },
) => {
  const record = asRecord(result.structuredContent)
    ?? asRecord(extractArray(result.structuredContent, ["experiments", "results"])[0]);

  return {
    text: getTextSummary(result),
    experiment: record
      ? {
          id: pickString(record, ["id"]),
          name: pickString(record, ["name"]),
          status: pickString(record, ["status", "phase"]),
          featureFlagKey: pickString(record, ["feature_flag_key", "flag_key"]),
          startDate: pickString(record, ["start_date", "startDate"]),
          endDate: pickString(record, ["end_date", "endDate"]),
          url: pickString(record, ["url", "href"]),
          raw: record,
        }
      : null,
  };
};

export const normalizePostHogExperimentResults = (
  result: { readonly text: string; readonly structuredContent?: unknown },
) => {
  const record = asRecord(result.structuredContent);
  return {
    text: getTextSummary(result),
    experimentId: pickString(record, ["id", "experiment_id", "experimentId"]),
    status: pickString(record, ["status", "phase"]),
    winningVariant: pickString(record, ["winning_variant", "winningVariant"]),
    exposureCount: pickNumber(record, ["exposure_count", "exposureCount", "sample_size"]),
    significance: pickNumber(record, ["significance", "confidence"]),
    summary: pickString(record, ["summary", "description"]),
    raw: result.structuredContent,
  };
};

export const normalizePostHogLogAttributes = (
  result: { readonly text: string; readonly structuredContent?: unknown },
) => {
  const rows = extractArray(result.structuredContent, ["attributes", "results", "items", "data"]);
  return {
    text: getTextSummary(result),
    total: rows.length,
    attributes: rows.map((row) => {
      const record = asRecord(row);
      return {
        key: pickString(record, ["key", "name", "attribute"]) ?? "<unknown>",
        type: pickString(record, ["type"]),
        valuesPreview: toStringArray(record?.values ?? record?.examples),
        raw: row,
      };
    }),
  };
};

export const normalizePostHogLogQuery = (
  result: { readonly text: string; readonly structuredContent?: unknown },
) => {
  const rows = extractArray(result.structuredContent, ["logs", "results", "entries", "items", "data"]);
  return {
    text: getTextSummary(result),
    total: rows.length,
    entries: rows.map((row) => {
      const record = asRecord(row);
      const attributes = asRecord(record?.attributes) ?? asRecord(record?.properties);
      return {
        id: pickString(record, ["id"]),
        timestamp: pickString(record, ["timestamp", "created_at", "time"]),
        level: pickString(record, ["level", "severity"]),
        message: pickString(record, ["message", "text", "body"]),
        service: pickString(record, ["service", "source"]) ?? pickString(attributes, ["service"]),
        traceId: pickString(record, ["trace_id", "traceId"]) ?? pickString(attributes, ["trace_id", "traceId"]),
        attributes: attributes ?? {},
        raw: row,
      };
    }),
  };
};

export const normalizePostHogSchemaEntities = (
  result: { readonly text: string; readonly structuredContent?: unknown },
  keys: readonly string[],
) => {
  const rows = extractArray(result.structuredContent, keys);
  return {
    text: getTextSummary(result),
    total: rows.length,
    entities: rows.map((row) => {
      const record = asRecord(row);
      return {
        name: pickString(record, ["name", "key", "event", "table"]) ?? "<unknown>",
        kind: pickString(record, ["kind", "type"]),
        description: pickString(record, ["description"]),
        raw: row,
      };
    }),
    raw: result.structuredContent,
  };
};

export const normalizePostHogSqlResult = (
  result: { readonly text: string; readonly structuredContent?: unknown },
) => {
  const structured = asRecord(result.structuredContent);
  const nestedResults = asRecord(structured?.results) ?? structured;
  const columns = toStringArray(nestedResults?.columns);
  const rowArray = Array.isArray(nestedResults?.results)
    ? nestedResults.results as unknown[]
    : Array.isArray(nestedResults?.rows)
      ? nestedResults.rows as unknown[]
      : [];

  const rows = rowArray.map((row) => {
    if (Array.isArray(row)) {
      return Object.fromEntries(row.map((value, index) => [columns[index] ?? String(index), value]));
    }

    return asRecord(row) ?? {};
  });

  return {
    text: getTextSummary(result),
    columns,
    rows,
    raw: result.structuredContent,
  };
};

export const normalizePostHogDocsSearch = (
  result: { readonly text: string; readonly structuredContent?: unknown },
) => {
  const rows = extractArray(result.structuredContent, ["results", "hits", "docs", "items", "data"]);
  return {
    text: getTextSummary(result),
    total: rows.length,
    results: rows.map((row) => {
      const record = asRecord(row);
      return {
        title: pickString(record, ["title", "name"]),
        url: pickString(record, ["url", "href"]),
        snippet: pickString(record, ["snippet", "description", "content", "text"]),
        raw: row,
      };
    }),
  };
};
