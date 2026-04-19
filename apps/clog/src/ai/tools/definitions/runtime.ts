import {
  RuntimeGetConversationInputSchema,
  RuntimeGetConversationResultSchema,
  RuntimeGetInfoInputSchema,
  RuntimeGetInfoResultSchema,
  RuntimeGetMonitoringSnapshotInputSchema,
  RuntimeGetMonitoringSnapshotResultSchema,
  RuntimeGetRecentLogsInputSchema,
  RuntimeGetRecentLogsResultSchema,
  RuntimeListActionsInputSchema,
  RuntimeListActionsResultSchema,
  RuntimeListConversationsInputSchema,
  RuntimeListConversationsResultSchema,
  RuntimeListRoutinesInputSchema,
  RuntimeListRoutinesResultSchema,
  RuntimeRunActionInputSchema,
  RuntimeRunActionResultSchema,
  RuntimeRunRoutineInputSchema,
  RuntimeRunRoutineResultSchema,
  RuntimeSearchMessagesInputSchema,
  RuntimeSearchMessagesResultSchema,
  RuntimeGetStateSnapshotInputSchema,
  RuntimeGetStateSnapshotResultSchema,
  RuntimeReadKnowledgeInputSchema,
  RuntimeReadKnowledgeResultSchema,
  RuntimeReadJsonInputSchema,
  RuntimeReadJsonResultSchema,
  RuntimeWriteWorkspaceFileInputSchema,
  RuntimeWriteWorkspaceFileResultSchema,
} from "../schema/tools";
import type { RegisteredTool } from "../types";
import { buildTimeRangeDescriptor } from "../time-range";

type RuntimeToolMetadata = Pick<RegisteredTool, "exposureTier" | "capabilityGroup">;

const runtimeToolMetadata: Record<
  | "runtime_get_state_snapshot"
  | "runtime_get_info"
  | "runtime_list_conversations"
  | "runtime_get_conversation"
  | "runtime_search_messages"
  | "runtime_get_recent_logs"
  | "runtime_get_monitoring_snapshot"
  | "runtime_list_actions"
  | "runtime_run_action"
  | "runtime_list_routines"
  | "runtime_run_routine"
  | "runtime_read_knowledge"
  | "runtime_read_json"
  | "runtime_write_workspace_file",
  RuntimeToolMetadata
> = {
  runtime_get_state_snapshot: { exposureTier: "discoverable", capabilityGroup: "runtime_context" },
  runtime_get_info: { exposureTier: "core", capabilityGroup: "runtime_context" },
  runtime_list_conversations: { exposureTier: "core", capabilityGroup: "runtime_context" },
  runtime_get_conversation: { exposureTier: "core", capabilityGroup: "runtime_context" },
  runtime_search_messages: { exposureTier: "core", capabilityGroup: "runtime_context" },
  runtime_get_recent_logs: { exposureTier: "discoverable", capabilityGroup: "runtime_read" },
  runtime_get_monitoring_snapshot: { exposureTier: "discoverable", capabilityGroup: "runtime_read" },
  runtime_list_actions: { exposureTier: "internal", capabilityGroup: "automation" },
  runtime_run_action: { exposureTier: "internal", capabilityGroup: "automation" },
  runtime_list_routines: { exposureTier: "internal", capabilityGroup: "automation" },
  runtime_run_routine: { exposureTier: "internal", capabilityGroup: "automation" },
  runtime_read_knowledge: { exposureTier: "core", capabilityGroup: "knowledge" },
  runtime_read_json: { exposureTier: "core", capabilityGroup: "runtime_read" },
  runtime_write_workspace_file: { exposureTier: "core", capabilityGroup: "workspace" },
};

const baseRuntimeTools = [
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
    name: "runtime_get_info",
    title: "Runtime Get Info",
    description: "Generic runtime info entrypoint that can summarize state, conversations, a thread, message search, monitoring, or logs for the current context.",
    integration: "runtime",
    approvalRequired: false,
    implemented: true,
    inputSchema: RuntimeGetInfoInputSchema,
    outputSchema: RuntimeGetInfoResultSchema,
    isEnabled() {
      return true;
    },
    execute(services, input) {
      if (!services.runtime) {
        throw new Error("Runtime read services are unavailable");
      }

      const timeRange = buildTimeRangeDescriptor(input.timePreset, input.windowMinutes);
      const base = {
        generatedAt: Date.now(),
        context: input.context?.trim() || null,
        timeRange,
      };

      switch (input.kind) {
        case "state": {
          const data = services.runtime.getStateSnapshot({
            threadLimit: input.threadLimit,
            messageLimitPerThread: input.messageLimitPerThread,
            findingLimit: input.findingLimit,
            memoryLimit: input.memoryLimit,
            actionResultLimit: input.actionResultLimit,
          });
          return {
            ...base,
            generatedAt: data.generatedAt,
            kind: input.kind,
            suggestedTools: ["runtime_get_info", "runtime_list_conversations", "runtime_get_conversation"],
            printout: `Runtime state: ${data.status}; ${data.openFindingsCount} open findings; ${data.recentThreads.length} recent threads.`,
            data,
          };
        }
        case "conversations": {
          const data = services.runtime.listConversations({
            limit: input.limit,
            channel: input.channel,
            titleContains: input.titleContains,
            timePreset: input.timePreset,
            windowMinutes: input.windowMinutes,
          });
          return {
            ...base,
            generatedAt: data.generatedAt,
            kind: input.kind,
            suggestedTools: ["runtime_list_conversations", "runtime_get_conversation", "runtime_search_messages"],
            printout: `Found ${data.conversations.length} conversations${input.channel ? ` in ${input.channel}` : ""}.`,
            data,
          };
        }
        case "conversation": {
          if (!input.threadId) {
            throw new Error("threadId is required when kind is conversation");
          }

          const data = services.runtime.getConversation({
            threadId: input.threadId,
            messageOffset: input.messageOffset,
            messageLimit: input.messageLimit,
            tokenBudget: input.tokenBudget,
            timePreset: input.timePreset,
            windowMinutes: input.windowMinutes,
          });
          return {
            ...base,
            generatedAt: data.generatedAt,
            kind: input.kind,
            suggestedTools: ["runtime_get_conversation", "runtime_search_messages", "runtime_list_conversations"],
            printout: data.continuationHint
              ? `Conversation ${data.thread.title} returned ${data.messages.length} messages (~${data.returnedTokenEstimate} tokens). ${data.continuationHint}`
              : `Conversation ${data.thread.title} returned ${data.messages.length} messages (~${data.returnedTokenEstimate} tokens).`,
            data,
          };
        }
        case "message_search": {
          if (!input.query) {
            throw new Error("query is required when kind is message_search");
          }

          const data = services.runtime.searchMessages({
            query: input.query,
            threadId: input.threadId,
            channel: input.channel,
            limit: input.limit,
            caseSensitive: input.caseSensitive,
            timePreset: input.timePreset,
            windowMinutes: input.windowMinutes,
          });
          return {
            ...base,
            generatedAt: data.generatedAt,
            kind: input.kind,
            suggestedTools: ["runtime_search_messages", "runtime_get_conversation", "runtime_list_conversations"],
            printout: `Message search returned ${data.matches.length} matches${data.truncated ? " (truncated)" : ""}.`,
            data,
          };
        }
        case "monitoring": {
          const data = services.runtime.getMonitoringSnapshot({
            reportLimit: input.reportLimit,
            operationHistoryLimit: input.operationHistoryLimit,
          });
          return {
            ...base,
            generatedAt: data.generatedAt,
            kind: input.kind,
            suggestedTools: ["runtime_get_info", "runtime_read_json", "posthog_get_health_summary"],
            printout: `Monitoring snapshot includes ${data.recentPerformanceReports.length} reports and ${data.recentPostHogOperations.length} PostHog operations.`,
            data,
          };
        }
        case "logs": {
          const data = services.runtime.getRecentLogs({
            fileLimit: input.fileLimit,
            lineLimit: input.lineLimit,
            pathContains: input.pathContains,
          });
          return {
            ...base,
            generatedAt: data.generatedAt,
            kind: input.kind,
            suggestedTools: ["runtime_get_info", "runtime_read_json", "runtime_search_messages"],
            printout: `Loaded ${data.files.length} recent log files.`,
            data,
          };
        }
      }
    },
  },
  {
    name: "runtime_list_conversations",
    title: "Runtime Conversation List",
    description: "List conversation threads from the runtime store with optional channel, title, and recent-window filters plus recency ordering.",
    integration: "runtime",
    approvalRequired: false,
    implemented: true,
    inputSchema: RuntimeListConversationsInputSchema,
    outputSchema: RuntimeListConversationsResultSchema,
    isEnabled() {
      return true;
    },
    execute(services, input) {
      if (!services.runtime) {
        throw new Error("Runtime read services are unavailable");
      }

      return services.runtime.listConversations(input);
    },
  },
  {
    name: "runtime_get_conversation",
    title: "Runtime Conversation Read",
    description: "Read a conversation thread by threadId and return a token-bounded chunk plus exact instructions for reading the rest.",
    integration: "runtime",
    approvalRequired: false,
    implemented: true,
    inputSchema: RuntimeGetConversationInputSchema,
    outputSchema: RuntimeGetConversationResultSchema,
    isEnabled() {
      return true;
    },
    execute(services, input) {
      if (!services.runtime) {
        throw new Error("Runtime read services are unavailable");
      }

      return services.runtime.getConversation(input);
    },
  },
  {
    name: "runtime_search_messages",
    title: "Runtime Message Search",
    description: "Keyword search across runtime conversation messages with optional thread, channel, and recent-window filters.",
    integration: "runtime",
    approvalRequired: false,
    implemented: true,
    inputSchema: RuntimeSearchMessagesInputSchema,
    outputSchema: RuntimeSearchMessagesResultSchema,
    isEnabled() {
      return true;
    },
    execute(services, input) {
      if (!services.runtime) {
        throw new Error("Runtime read services are unavailable");
      }

      return services.runtime.searchMessages(input);
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
    description: "List or read text files inside the current runtime workspace, such as README files and project notes.",
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
  {
    name: "runtime_read_json",
    title: "Runtime JSON Reader",
    description: "Read a JSON artifact inside the current runtime workspace using a path like workspace/performance-reports/report.json, with optional dot-path field selection for deeper inspection.",
    integration: "runtime",
    approvalRequired: false,
    implemented: true,
    inputSchema: RuntimeReadJsonInputSchema,
    outputSchema: RuntimeReadJsonResultSchema,
    isEnabled() {
      return true;
    },
    execute(services, input) {
      if (!services.runtime) {
        throw new Error("Runtime read services are unavailable");
      }

      return services.runtime.readJson(input);
    },
  },
  {
    name: "runtime_write_workspace_file",
    title: "Runtime Write Workspace File",
    description: "Create or overwrite a UTF-8 text file inside the current runtime workspace.",
    integration: "runtime",
    approvalRequired: false,
    implemented: true,
    inputSchema: RuntimeWriteWorkspaceFileInputSchema,
    outputSchema: RuntimeWriteWorkspaceFileResultSchema,
    isEnabled() {
      return true;
    },
    execute(services, input) {
      if (!services.runtime) {
        throw new Error("Runtime read services are unavailable");
      }

      return services.runtime.writeWorkspaceFile(input);
    },
  },
] as const satisfies readonly Omit<RegisteredTool, "exposureTier" | "capabilityGroup">[];

export const runtimeTools: readonly RegisteredTool[] = baseRuntimeTools.map((tool) => ({
  ...runtimeToolMetadata[tool.name],
  ...tool,
}));
