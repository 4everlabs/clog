import { describe, expect, test } from "bun:test";
import { buildPostHogUserFunnelSnapshot } from "../apps/clog/src/ai/integrations/posthog/user-funnel-snapshot";

describe("PostHog user funnel snapshot", () => {
  test("builds funnel counts, biggest drop-off, and warns when free-tier instrumentation is missing", async () => {
    const rowsByName: Record<string, readonly Record<string, unknown>[]> = {
      user_funnel_topline_60m: [{
        homepage_unique_visitors: 14,
        new_profiles_started: 5,
      }],
      user_funnel_main_7d: [
        { action_id: "homepage", custom_name: "Homepage visited", count: 14 },
        { action_id: "app", custom_name: "App visited", count: 10 },
        { action_id: "auth", custom_name: "Auth completed", count: 8 },
        { action_id: "profile", custom_name: "Profile creation started", count: 5 },
        { action_id: "payment", custom_name: "Reached payment step", count: 3 },
        { action_id: "checkout", custom_name: "Checkout started", count: 2 },
        { action_id: "paid", custom_name: "Paid confirmed", count: 1 },
      ],
      user_funnel_branches_7d: [{
        payment_step_users: 3,
        checkout_started_users: 2,
        core_checkout_users: 2,
        pro_checkout_users: 0,
        paid_conversion_users: 1,
        free_named_event_users: 0,
        free_plan_key_users: 0,
        free_offer_key_users: 0,
      }],
    };

    const snapshot = await buildPostHogUserFunnelSnapshot({
      generatedAt: 1_700_000_000_000,
      runQueryRows: async (name) => rowsByName[name] ?? [],
    });

    expect(snapshot.topline).toEqual({
      homepageUniqueVisitors: 14,
      newProfilesStarted: 5,
    });
    expect(snapshot.funnel.steps[1]).toMatchObject({
      label: "App visited",
      count: 10,
      conversionFromPreviousRatio: 71.4,
      dropoffFromPreviousCount: 4,
      dropoffFromPreviousRatio: 28.6,
    });
    expect(snapshot.funnel.biggestDropoff).toEqual({
      fromStepId: "homepage",
      fromLabel: "Homepage visited",
      toStepId: "app",
      toLabel: "App visited",
      dropoffUsers: 4,
      dropoffRatio: 28.6,
    });
    expect(snapshot.funnel.branches.core).toMatchObject({
      count: 2,
      conversionFromPaymentStepRatio: 66.7,
      instrumented: true,
    });
    expect(snapshot.funnel.branches.freeTier).toMatchObject({
      count: null,
      instrumented: false,
    });
    expect(snapshot.instrumentationWarnings[0]).toContain("No canonical free-tier pick signal");
  });
});
