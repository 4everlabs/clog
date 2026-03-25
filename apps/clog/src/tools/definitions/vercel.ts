import { VercelTriggerDeployInputSchema, VercelTriggerDeployResultSchema } from "../../schema/tools";
import type { RegisteredTool } from "../types";

export const vercelTools = [
  {
    name: "vercel_trigger_deploy",
    title: "Vercel Trigger Deploy",
    description: "Trigger a Vercel deploy when deployment capability is enabled. Hidden until a concrete implementation is wired.",
    integration: "vercel",
    approvalRequired: true,
    implemented: false,
    inputSchema: VercelTriggerDeployInputSchema,
    outputSchema: VercelTriggerDeployResultSchema,
    isEnabled(capabilities) {
      return capabilities.vercel.canTriggerDeploy;
    },
  },
] as const satisfies readonly RegisteredTool[];
