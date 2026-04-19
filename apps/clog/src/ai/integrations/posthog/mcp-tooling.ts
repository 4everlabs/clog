const QUERY_LOGS_TOOL_NAME = "query-logs";

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
);

const toTrimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toFiniteNumber = (value: unknown): number | null => {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export const POSTHOG_DOCUMENTED_TO_LIVE_TOOL_ALIASES: Record<string, readonly string[]> = {
  "organization-details-get": ["organization-get"],
  "organizations-get": ["organizations-list"],
  "insights-get-all": ["insights-list"],
  "logs-list-attributes": ["logs-attributes-list"],
  "logs-list-attribute-values": ["logs-attribute-values-list"],
  "logs-query": [QUERY_LOGS_TOOL_NAME],
  "activity-logs-list": ["activity-log-list"],
};

export const resolvePostHogMcpToolName = (name: string): string => {
  return POSTHOG_DOCUMENTED_TO_LIVE_TOOL_ALIASES[name]?.[0] ?? name;
};

export const normalizePostHogMcpToolArguments = (
  toolName: string,
  args: Record<string, unknown> = {},
): Record<string, unknown> => {
  const resolvedToolName = resolvePostHogMcpToolName(toolName);
  if (resolvedToolName !== QUERY_LOGS_TOOL_NAME) {
    return args;
  }

  if (isRecord(args.query)) {
    return args;
  }

  const {
    query,
    limit,
    level,
    service,
    from,
    to,
    ...rest
  } = args;

  const searchTerm = toTrimmedString(query);
  const severityLevel = toTrimmedString(level);
  const serviceName = toTrimmedString(service);
  const dateFrom = toTrimmedString(from);
  const dateTo = toTrimmedString(to);
  const normalizedLimit = toFiniteNumber(limit);

  return {
    query: {
      ...rest,
      ...(searchTerm ? { searchTerm } : {}),
      ...(normalizedLimit !== null ? { limit: normalizedLimit } : {}),
      ...(severityLevel ? { severityLevels: [severityLevel.toLowerCase()] } : {}),
      ...(serviceName ? { serviceNames: [serviceName] } : {}),
      ...(dateFrom || dateTo
        ? {
            dateRange: {
              ...(dateFrom ? { date_from: dateFrom } : {}),
              ...(dateTo ? { date_to: dateTo } : {}),
            },
          }
        : {}),
    },
  };
};
