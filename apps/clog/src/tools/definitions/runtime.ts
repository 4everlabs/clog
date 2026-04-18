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
} from "../../schema/tools";
import type { RegisteredTool } from "../types";
import { buildTimeRangeDescriptor } from "../time-range";

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
            suggestedTools: ["runtime_get_state_snapshot", "runtime_list_conversations", "runtime_get_monitoring_snapshot"],
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
            suggestedTools: ["runtime_get_monitoring_snapshot", "posthog_get_health_summary", "runtime_get_recent_logs"],
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
            suggestedTools: ["runtime_get_recent_logs", "runtime_get_monitoring_snapshot", "runtime_get_state_snapshot"],
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
  {
    name: "runtime_read_json",
    title: "Runtime JSON Reader",
    description: "Read a JSON artifact inside the current runtime instance using a direct relative path like workspace/posthog-tool-output.json, with optional dot-path field selection for deeper inspection.",
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
] as const satisfies readonly RegisteredTool[];
