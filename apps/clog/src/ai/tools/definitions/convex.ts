import { ConvexRunQueryInputSchema, ConvexRunQueryResultSchema } from "../schema/tools";
import type { RegisteredTool } from "../types";

export const convexTools = [
  {
    name: "convex_run_query",
    title: "Convex Run Query",
    description: "Run a read-only Convex query against the configured deployment using the Convex HTTP query API.",
    integration: "convex",
    exposureTier: "core",
    capabilityGroup: "workspace",
    approvalRequired: false,
    implemented: true,
    inputSchema: ConvexRunQueryInputSchema,
    outputSchema: ConvexRunQueryResultSchema,
    isEnabled(capabilities) {
      return capabilities.convex.canReadData;
    },
    async execute(services, input) {
      if (!services.convex) {
        throw new Error("Convex services are unavailable");
      }

      return await services.convex.runQuery(input);
    },
  },
] as const satisfies readonly RegisteredTool[];
