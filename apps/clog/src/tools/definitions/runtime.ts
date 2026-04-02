import {
  RuntimeGetMonitoringSnapshotInputSchema,
  RuntimeGetMonitoringSnapshotResultSchema,
  RuntimeGetRecentLogsInputSchema,
  RuntimeGetRecentLogsResultSchema,
  RuntimeListActionsInputSchema,
  RuntimeListActionsResultSchema,
  RuntimeListRoutinesInputSchema,
  RuntimeListRoutinesResultSchema,
  RuntimeRunActionInputSchema,
  RuntimeRunActionResultSchema,
  RuntimeRunRoutineInputSchema,
  RuntimeRunRoutineResultSchema,
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
    name: "runtime_get_monitoring_snapshot",
    title: "Runtime Monitoring Snapshot",
    description: "Read retained PostHog monitoring artifacts including recent performance reports and historical tool-operation snapshots from the runtime workspace.",
    integration: "runtime",
    approvalRequired: false,
    implemented: true,
    inputSchema: RuntimeGetMonitoringSnapshotInputSchema,
    outputSchema: RuntimeGetMonitoringSnapshotResultSchema,
    isEnabled() {
      return true;
    },
    execute(services, input) {
      if (!services.runtime) {
        throw new Error("Runtime read services are unavailable");
      }

      return services.runtime.getMonitoringSnapshot(input);
    },
  },
  {
    name: "runtime_list_actions",
    title: "Runtime Action Catalog",
    description: "List small modular runtime actions. Actions are the building blocks that routines string together.",
    integration: "runtime",
    approvalRequired: false,
    implemented: true,
    inputSchema: RuntimeListActionsInputSchema,
    outputSchema: RuntimeListActionsResultSchema,
    isEnabled() {
      return true;
    },
    execute(services, input) {
      if (!services.runtime) {
        throw new Error("Runtime orchestration services are unavailable");
      }

      return services.runtime.listActions(input);
    },
  },
  {
    name: "runtime_run_action",
    title: "Runtime Run Action",
    description: "Run one small modular runtime action. Prefer actions when you only need a single step.",
    integration: "runtime",
    approvalRequired: false,
    implemented: true,
    inputSchema: RuntimeRunActionInputSchema,
    outputSchema: RuntimeRunActionResultSchema,
    isEnabled() {
      return true;
    },
    async execute(services, input) {
      if (!services.runtime) {
        throw new Error("Runtime orchestration services are unavailable");
      }

      return await services.runtime.runAction(input);
    },
  },
  {
    name: "runtime_list_routines",
    title: "Runtime Routine Catalog",
    description: "List smart routines. Routines string multiple actions together without introducing heavy workflow overhead.",
    integration: "runtime",
    approvalRequired: false,
    implemented: true,
    inputSchema: RuntimeListRoutinesInputSchema,
    outputSchema: RuntimeListRoutinesResultSchema,
    isEnabled() {
      return true;
    },
    execute(services, input) {
      if (!services.runtime) {
        throw new Error("Runtime orchestration services are unavailable");
      }

      return services.runtime.listRoutines(input);
    },
  },
  {
    name: "runtime_run_routine",
    title: "Runtime Run Routine",
    description: "Run a smart routine that strings multiple actions together into one compact investigation or review flow.",
    integration: "runtime",
    approvalRequired: false,
    implemented: true,
    inputSchema: RuntimeRunRoutineInputSchema,
    outputSchema: RuntimeRunRoutineResultSchema,
    isEnabled() {
      return true;
    },
    async execute(services, input) {
      if (!services.runtime) {
        throw new Error("Runtime orchestration services are unavailable");
      }

      return await services.runtime.runRoutine(input);
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
