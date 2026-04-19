import { describe, expect, test } from "bun:test";
import { normalizePostHogDashboardList } from "../apps/clog/src/ai/integrations/posthog/native-tool-normalizers";

describe("normalizePostHogDashboardList", () => {
  test("keeps live dashboard totals and rows when PostHog only returns text blocks", () => {
    const normalized = normalizePostHogDashboardList({
      text: [
        "count: 8",
        "next: null",
        "previous: null",
        "results[2]:",
        "  - id: 1478599",
        "    name: Core KPIs",
        "    description: Main operator view",
        "    url: https://app.posthog.com/project/1/dashboard/1478599",
        "  - id: 1478600",
        "    name: Release Watch",
        "    description: Release metrics",
        "    url: https://app.posthog.com/project/1/dashboard/1478600",
      ].join("\n"),
      structuredContent: undefined,
    });

    expect(normalized.total).toBe(8);
    expect(normalized.dashboards).toHaveLength(2);
    expect(normalized.dashboards[0]).toMatchObject({
      id: "1478599",
      name: "Core KPIs",
      description: "Main operator view",
      url: "https://app.posthog.com/project/1/dashboard/1478599",
    });
    expect(normalized.dashboards[1]).toMatchObject({
      id: "1478600",
      name: "Release Watch",
    });
  });
});
