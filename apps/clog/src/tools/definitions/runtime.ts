import {
  RuntimeGetRecentLogsInputSchema,
  RuntimeGetRecentLogsResultSchema,
  RuntimeGetStateSnapshotInputSchema,
  RuntimeGetStateSnapshotResultSchema,
  RuntimeReadKnowledgeInputSchema,
  RuntimeReadKnowledgeResultSchema,
} from "../../schema/tools";
import type { RegisteredTool } from "../types";

export const runtimeTools = [
  {
    name: "runtime_get_state_snapshot",
    title: "Runtime State Snapshot",
    description: "Read a compact snapshot of current runtime state including status, open findings, recent threads, memories, and recent action results.",
    integration: "runtime",
    approvalRequired: false,
    implemented: true,
    inputSchema: RuntimeGetStateSnapshotInputSchema,
    outputSchema: RuntimeGetStateSnapshotResultSchema,
    isEnabled() {
      return true;
    },
    execute(services, input) {
      if (!services.runtime) {
        throw new Error("Runtime read services are unavailable");
      }

      return services.runtime.getStateSnapshot(input);
    },
  },
  {
    name: "runtime_get_recent_logs",
    title: "Runtime Recent Logs",
    description: "Read the most recent internal runtime log files with tail output so you can inspect recent activity without loading the full log history.",
    integration: "runtime",
    approvalRequired: false,
    implemented: true,
    inputSchema: RuntimeGetRecentLogsInputSchema,
    outputSchema: RuntimeGetRecentLogsResultSchema,
    isEnabled() {
      return true;
    },
    execute(services, input) {
      if (!services.runtime) {
        throw new Error("Runtime read services are unavailable");
      }

      return services.runtime.getRecentLogs(input);
    },
  },
  {
    name: "runtime_read_knowledge",
    title: "Runtime Knowledge Reader",
    description: "List or read bundled runtime knowledge files and per-instance read-only runtime guidance like wakeup, settings, and tool visibility.",
    integration: "runtime",
    approvalRequired: false,
    implemented: true,
    inputSchema: RuntimeReadKnowledgeInputSchema,
    outputSchema: RuntimeReadKnowledgeResultSchema,
    isEnabled() {
      return true;
    },
    execute(services, input) {
      if (!services.runtime) {
        throw new Error("Runtime read services are unavailable");
      }

      return services.runtime.readKnowledge(input);
    },
  },
] as const satisfies readonly RegisteredTool[];
