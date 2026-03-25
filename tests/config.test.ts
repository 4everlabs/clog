import { describe, expect, test } from "bun:test";
import { loadAgentEnvironment } from "../apps/clog/src/config";

describe("loadAgentEnvironment", () => {
  test("parses PostHog runtime config and capabilities", () => {
    const env = loadAgentEnvironment({
      PORT: "3001",
      POSTHOG_CLAW_CHANNELS: "telegram,web",
      POSTHOG_CLAW_POSTHOG_HOST: "https://eu.posthog.com/",
      POSTHOG_CLAW_POSTHOG_PROJECT_ID: "12345",
      POSTHOG_CLAW_POSTHOG_PERSONAL_API_KEY: "phx_test",
      POSTHOG_CLAW_POSTHOG_MANAGE_ENDPOINTS: "true",
      POSTHOG_CLAW_POSTHOG_UPLOAD_SOURCEMAPS: "true",
      POSTHOG_CLAW_POSTHOG_ENABLE_FLAGS: "true",
      POSTHOG_CLAW_POSTHOG_READ_FLAGS: "true",
      POSTHOG_CLAW_POSTHOG_CLI_TIMEOUT_MS: "45000",
      POSTHOG_CLAW_POSTHOG_PRIMARY_INSIGHT_NAME: "Revenue monitor",
      POSTHOG_CLAW_POSTHOG_PRIMARY_INSIGHT_QUERY: "SELECT 80 AS current_value, 100 AS previous_value",
      POSTHOG_CLAW_POSTHOG_PRIMARY_INSIGHT_REGRESSION_THRESHOLD_PERCENT: "15",
      POSTHOG_CLAW_POSTHOG_PRIMARY_INSIGHT_MIN_PREVIOUS_VALUE: "20",
    });

    expect(env.port).toBe(3001);
    expect(env.channels).toEqual(["telegram", "web"]);
    expect(env.posthog.host).toBe("https://eu.posthog.com");
    expect(env.posthog.projectId).toBe("12345");
    expect(env.posthog.personalApiKey).toBe("phx_test");
    expect(env.posthog.cliTimeoutMs).toBe(45_000);
    expect(env.storage.instanceId).toBe("personal-instance");
    expect(env.storage.databasePath.endsWith(".runtime/instances/personal-instance/brain/storage/runtime.sqlite")).toBe(true);
    expect(env.posthog.insightMonitors).toHaveLength(1);
    expect(env.posthog.insightMonitors[0]).toMatchObject({
      name: "Revenue monitor",
      regressionThresholdPercent: 15,
      minimumPreviousValue: 20,
    });
    expect(env.capabilities.posthog.canReadInsights).toBe(true);
    expect(env.capabilities.posthog.canReadFlags).toBe(true);
    expect(env.capabilities.posthog.canManageEndpoints).toBe(true);
    expect(env.capabilities.posthog.canUploadSourcemaps).toBe(true);
  });

  test("disables PostHog management capabilities when credentials are missing", () => {
    const env = loadAgentEnvironment({
      POSTHOG_CLAW_POSTHOG_PROJECT_ID: "12345",
    });

    expect(env.capabilities.posthog.canReadInsights).toBe(false);
    expect(env.capabilities.posthog.canReadErrors).toBe(false);
    expect(env.capabilities.posthog.canManageEndpoints).toBe(false);
  });

  test("allows overriding the runtime database path", () => {
    const env = loadAgentEnvironment({
      POSTHOG_CLAW_INSTANCE_ID: "operator-1",
      POSTHOG_CLAW_RUNTIME_DB_PATH: ".runtime/instances/operator-1/brain/storage/custom.sqlite",
    });

    expect(env.storage.instanceId).toBe("operator-1");
    expect(env.storage.databasePath.endsWith("operator-1/brain/storage/custom.sqlite")).toBe(true);
  });
});
