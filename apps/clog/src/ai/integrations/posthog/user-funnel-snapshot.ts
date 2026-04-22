const MINUTE_IN_MS = 60_000;
const DAY_IN_MS = 24 * 60 * MINUTE_IN_MS;

export const POSTHOG_USER_FUNNEL_DEFAULT_TOPLINE_WINDOW_MINUTES = 60;
export const POSTHOG_USER_FUNNEL_DEFAULT_FUNNEL_WINDOW_DAYS = 7;

export interface PostHogUserFunnelStep {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly conversionFromPreviousRatio: number | null;
  readonly dropoffFromPreviousCount: number | null;
  readonly dropoffFromPreviousRatio: number | null;
}

export interface PostHogUserFunnelBiggestDropoff {
  readonly fromStepId: string;
  readonly fromLabel: string;
  readonly toStepId: string;
  readonly toLabel: string;
  readonly dropoffUsers: number;
  readonly dropoffRatio: number;
}

export interface PostHogUserFunnelBranch {
  readonly label: string;
  readonly count: number | null;
  readonly conversionFromPaymentStepRatio: number | null;
  readonly instrumented: boolean;
  readonly note: string | null;
}

export interface PostHogUserFunnelSnapshot {
  readonly generatedAt: number;
  readonly toplineWindowMinutes: number;
  readonly funnelWindowDays: number;
  readonly topline: {
    readonly homepageUniqueVisitors: number;
    readonly newProfilesStarted: number;
  };
  readonly funnel: {
    readonly steps: readonly PostHogUserFunnelStep[];
    readonly biggestDropoff: PostHogUserFunnelBiggestDropoff | null;
    readonly paymentStepUsers: number;
    readonly checkoutStartedUsers: number;
    readonly paidConversionUsers: number;
    readonly branches: {
      readonly freeTier: PostHogUserFunnelBranch;
      readonly core: PostHogUserFunnelBranch;
      readonly pro: PostHogUserFunnelBranch;
    };
  };
  readonly instrumentationWarnings: readonly string[];
}

export interface BuildPostHogUserFunnelSnapshotInput {
  readonly generatedAt?: number;
  readonly toplineWindowMinutes?: number;
  readonly funnelWindowDays?: number;
  readonly runQueryRows: (name: string, query: Record<string, unknown>) => Promise<readonly Record<string, unknown>[]>;
}

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
};

const round = (value: number, decimals = 1): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const clampInteger = (value: number | undefined, fallback: number, minimum: number, maximum: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
};

const createDateRange = (startAt: number, endAt: number) => ({
  date_from: new Date(startAt).toISOString(),
  date_to: new Date(endAt).toISOString(),
  explicitDate: true,
});

const createToplineQuery = (startAt: number, endAt: number): Record<string, unknown> => ({
  kind: "DataVisualizationNode",
  source: {
    kind: "HogQLQuery",
    query: `
SELECT
  uniqIf(
    person_id,
    event = '$pageview'
      AND properties.$host = 'www.4ever.ai'
      AND coalesce(nullIf(toString(properties.$pathname), ''), '/') = '/'
  ) AS homepage_unique_visitors,
  uniqIf(
    person_id,
    event = 'onboarding_intro_started'
      AND lowerUTF8(toString(properties.deploymentEnvironment)) = 'production'
  ) AS new_profiles_started
FROM events
`,
    filters: {
      dateRange: createDateRange(startAt, endAt),
      filterTestAccounts: true,
    },
  },
});

const createMainFunnelQuery = (startAt: number, endAt: number, funnelWindowDays: number): Record<string, unknown> => ({
  kind: "InsightVizNode",
  source: {
    kind: "FunnelsQuery",
    series: [
      {
        kind: "EventsNode",
        event: "$pageview",
        custom_name: "Homepage visited",
        properties: [
          {
            key: "$host",
            type: "event",
            value: "www.4ever.ai",
            operator: "exact",
          },
          {
            key: "$pathname",
            type: "event",
            value: "/",
            operator: "exact",
          },
        ],
      },
      {
        kind: "EventsNode",
        event: "$pageview",
        custom_name: "App visited",
        properties: [
          {
            key: "$host",
            type: "event",
            value: ["app.4ever.ai", "www.app.4ever.ai"],
            operator: "exact",
          },
        ],
      },
      {
        kind: "EventsNode",
        event: "auth_completed",
        custom_name: "Auth completed",
        properties: [
          {
            key: "deploymentEnvironment",
            type: "event",
            value: ["production"],
            operator: "exact",
          },
        ],
      },
      {
        kind: "EventsNode",
        event: "onboarding_intro_started",
        custom_name: "Profile creation started",
        properties: [
          {
            key: "deploymentEnvironment",
            type: "event",
            value: ["production"],
            operator: "exact",
          },
        ],
      },
      {
        kind: "EventsNode",
        event: "onboarding_intro_step_viewed",
        custom_name: "Reached payment step",
        properties: [
          {
            key: "deploymentEnvironment",
            type: "event",
            value: ["production"],
            operator: "exact",
          },
          {
            key: "stepId",
            type: "event",
            value: ["payment"],
            operator: "exact",
          },
        ],
      },
      {
        kind: "EventsNode",
        event: "billing_checkout_started",
        custom_name: "Checkout started",
        properties: [
          {
            key: "deploymentEnvironment",
            type: "event",
            value: ["production"],
            operator: "exact",
          },
        ],
      },
      {
        kind: "EventsNode",
        event: "paid_conversion_confirmed",
        custom_name: "Paid confirmed",
        properties: [
          {
            key: "deploymentEnvironment",
            type: "event",
            value: ["production"],
            operator: "exact",
          },
        ],
      },
    ],
    dateRange: createDateRange(startAt, endAt),
    properties: [],
    funnelsFilter: {
      layout: "horizontal",
      funnelVizType: "steps",
      funnelOrderType: "ordered",
      funnelStepReference: "previous",
      funnelWindowInterval: funnelWindowDays,
      funnelWindowIntervalUnit: "day",
    },
    filterTestAccounts: true,
  },
});

const createBranchQuery = (startAt: number, endAt: number): Record<string, unknown> => ({
  kind: "DataVisualizationNode",
  source: {
    kind: "HogQLQuery",
    query: `
SELECT
  uniqIf(
    person_id,
    event = 'onboarding_intro_step_viewed'
      AND lowerUTF8(toString(properties.deploymentEnvironment)) = 'production'
      AND properties.stepId = 'payment'
  ) AS payment_step_users,
  uniqIf(
    person_id,
    event = 'billing_checkout_started'
      AND lowerUTF8(toString(properties.deploymentEnvironment)) = 'production'
  ) AS checkout_started_users,
  uniqIf(
    person_id,
    event = 'billing_checkout_started'
      AND lowerUTF8(toString(properties.deploymentEnvironment)) = 'production'
      AND properties.planKey = 'pro'
  ) AS core_checkout_users,
  uniqIf(
    person_id,
    event = 'billing_checkout_started'
      AND lowerUTF8(toString(properties.deploymentEnvironment)) = 'production'
      AND properties.planKey = 'ultra'
  ) AS pro_checkout_users,
  uniqIf(
    person_id,
    event = 'paid_conversion_confirmed'
      AND lowerUTF8(toString(properties.deploymentEnvironment)) = 'production'
  ) AS paid_conversion_users,
  uniqIf(
    person_id,
    lowerUTF8(event) LIKE '%free%'
      AND lowerUTF8(toString(properties.deploymentEnvironment)) = 'production'
  ) AS free_named_event_users,
  uniqIf(
    person_id,
    lowerUTF8(toString(properties.planKey)) = 'free'
      AND lowerUTF8(toString(properties.deploymentEnvironment)) = 'production'
  ) AS free_plan_key_users,
  uniqIf(
    person_id,
    lowerUTF8(toString(properties.offerKey)) LIKE '%free%'
      AND lowerUTF8(toString(properties.deploymentEnvironment)) = 'production'
  ) AS free_offer_key_users
FROM events
`,
    filters: {
      dateRange: createDateRange(startAt, endAt),
      filterTestAccounts: true,
    },
  },
});

const readTopline = (row: Record<string, unknown> | undefined) => ({
  homepageUniqueVisitors: toNumber(row?.homepage_unique_visitors),
  newProfilesStarted: toNumber(row?.new_profiles_started),
});

const buildSteps = (rows: readonly Record<string, unknown>[]): {
  readonly steps: readonly PostHogUserFunnelStep[];
  readonly biggestDropoff: PostHogUserFunnelBiggestDropoff | null;
} => {
  const steps: PostHogUserFunnelStep[] = [];
  let biggestDropoff: PostHogUserFunnelBiggestDropoff | null = null;

  for (const row of rows) {
    const count = toNumber(row.count);
    const label = typeof row.custom_name === "string" && row.custom_name.trim().length > 0
      ? row.custom_name.trim()
      : typeof row.name === "string" && row.name.trim().length > 0
        ? row.name.trim()
        : "Unknown step";
    const id = typeof row.action_id === "string" && row.action_id.trim().length > 0
      ? row.action_id.trim()
      : label.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "");

    const previous = steps.at(-1);
    const dropoffCount = previous ? Math.max(previous.count - count, 0) : null;
    const conversionFromPreviousRatio = previous && previous.count > 0
      ? round((count / previous.count) * 100)
      : null;
    const dropoffFromPreviousRatio = previous && previous.count > 0
      ? round((Math.max(previous.count - count, 0) / previous.count) * 100)
      : null;

    const step: PostHogUserFunnelStep = {
      id,
      label,
      count,
      conversionFromPreviousRatio,
      dropoffFromPreviousCount: dropoffCount,
      dropoffFromPreviousRatio,
    };
    steps.push(step);

    if (previous && dropoffCount !== null && dropoffFromPreviousRatio !== null) {
      if (!biggestDropoff || dropoffCount > biggestDropoff.dropoffUsers) {
        biggestDropoff = {
          fromStepId: previous.id,
          fromLabel: previous.label,
          toStepId: step.id,
          toLabel: step.label,
          dropoffUsers: dropoffCount,
          dropoffRatio: dropoffFromPreviousRatio,
        };
      }
    }
  }

  return {
    steps,
    biggestDropoff,
  };
};

const buildBranch = (
  label: string,
  count: number | null,
  paymentStepUsers: number,
  instrumented: boolean,
  note: string | null,
): PostHogUserFunnelBranch => ({
  label,
  count,
  conversionFromPaymentStepRatio: count !== null && paymentStepUsers > 0
    ? round((count / paymentStepUsers) * 100)
    : null,
  instrumented,
  note,
});

export const buildPostHogUserFunnelSnapshot = async (
  input: BuildPostHogUserFunnelSnapshotInput,
): Promise<PostHogUserFunnelSnapshot> => {
  const generatedAt = input.generatedAt ?? Date.now();
  const toplineWindowMinutes = clampInteger(
    input.toplineWindowMinutes,
    POSTHOG_USER_FUNNEL_DEFAULT_TOPLINE_WINDOW_MINUTES,
    5,
    1_440,
  );
  const funnelWindowDays = clampInteger(
    input.funnelWindowDays,
    POSTHOG_USER_FUNNEL_DEFAULT_FUNNEL_WINDOW_DAYS,
    1,
    90,
  );

  const toplineStartAt = generatedAt - toplineWindowMinutes * MINUTE_IN_MS;
  const funnelStartAt = generatedAt - funnelWindowDays * DAY_IN_MS;

  const [toplineRows, funnelRows, branchRows] = await Promise.all([
    input.runQueryRows(
      `user_funnel_topline_${toplineWindowMinutes}m`,
      createToplineQuery(toplineStartAt, generatedAt),
    ),
    input.runQueryRows(
      `user_funnel_main_${funnelWindowDays}d`,
      createMainFunnelQuery(funnelStartAt, generatedAt, funnelWindowDays),
    ),
    input.runQueryRows(
      `user_funnel_branches_${funnelWindowDays}d`,
      createBranchQuery(funnelStartAt, generatedAt),
    ),
  ]);

  const topline = readTopline(toplineRows[0]);
  const { steps, biggestDropoff } = buildSteps(funnelRows);

  const branchRow = branchRows[0] ?? {};
  const paymentStepUsers = toNumber(branchRow.payment_step_users);
  const checkoutStartedUsers = toNumber(branchRow.checkout_started_users);
  const coreCheckoutUsers = toNumber(branchRow.core_checkout_users);
  const proCheckoutUsers = toNumber(branchRow.pro_checkout_users);
  const paidConversionUsers = toNumber(branchRow.paid_conversion_users);
  const freeTierSignalUsers = Math.max(
    toNumber(branchRow.free_named_event_users),
    toNumber(branchRow.free_plan_key_users),
    toNumber(branchRow.free_offer_key_users),
  );
  const freeTierInstrumented = freeTierSignalUsers > 0;
  const instrumentationWarnings = freeTierInstrumented
    ? []
    : [
      "No canonical free-tier pick signal is currently instrumented in PostHog. Add a dedicated event at the exact free-tier selection action, ideally `pricing_plan_selected` with `planKey='free'`.",
    ];

  return {
    generatedAt,
    toplineWindowMinutes,
    funnelWindowDays,
    topline,
    funnel: {
      steps,
      biggestDropoff,
      paymentStepUsers,
      checkoutStartedUsers,
      paidConversionUsers,
      branches: {
        freeTier: buildBranch(
          "Free tier picked",
          freeTierInstrumented ? freeTierSignalUsers : null,
          paymentStepUsers,
          freeTierInstrumented,
          freeTierInstrumented
            ? "Detected via a free-tier event/property match in the selected funnel window."
            : "Missing source-of-truth signal. Checked free-like event names plus `planKey` and `offerKey` matches.",
        ),
        core: buildBranch(
          "Core checkout started",
          coreCheckoutUsers,
          paymentStepUsers,
          true,
          "User-facing Core currently maps to internal `planKey='pro'`.",
        ),
        pro: buildBranch(
          "Pro checkout started",
          proCheckoutUsers,
          paymentStepUsers,
          true,
          "User-facing Pro currently maps to internal `planKey='ultra'`.",
        ),
      },
    },
    instrumentationWarnings,
  };
};

export const normalizeStructuredPostHogQueryRows = (
  result: {
    readonly structuredContent?: unknown;
  },
): readonly Record<string, unknown>[] => {
  const structured = result.structuredContent;
  if (!structured || typeof structured !== "object") {
    return [];
  }

  const structuredRecord = structured as Record<string, unknown>;
  const topLevelResults = structuredRecord.results;

  if (Array.isArray(topLevelResults)) {
    return topLevelResults.map((row) => (
      row && typeof row === "object" && !Array.isArray(row)
        ? row as Record<string, unknown>
        : { value: row }
    ));
  }

  if (topLevelResults && typeof topLevelResults === "object" && !Array.isArray(topLevelResults)) {
    const resultRecord = topLevelResults as Record<string, unknown>;
    const columns = Array.isArray(resultRecord.columns)
      ? resultRecord.columns.map((value) => typeof value === "string" ? value : "")
      : [];
    const rows = Array.isArray(resultRecord.results) ? resultRecord.results : [];
    return rows.map((row) => {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        return row as Record<string, unknown>;
      }

      if (Array.isArray(row)) {
        return Object.fromEntries(columns.map((column, index) => [column, row[index] ?? null]));
      }

      return { value: row };
    });
  }

  return [];
};

