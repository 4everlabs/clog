import { NotionGetTodoListInputSchema, NotionGetTodoListResultSchema } from "../schema/tools";
import type { RegisteredTool } from "../types";

export const notionTools = [
  {
    name: "notion_get_todo_list",
    title: "Notion Todo List",
    description: "Read the configured Notion todo list and return a concise printout of what still needs to be done.",
    integration: "notion",
    exposureTier: "core",
    capabilityGroup: "automation",
    approvalRequired: false,
    implemented: true,
    inputSchema: NotionGetTodoListInputSchema,
    outputSchema: NotionGetTodoListResultSchema,
    isEnabled(capabilities) {
      return capabilities.notion.canReadTodo;
    },
    async execute(services, input) {
      if (!services.notion) {
        throw new Error("Notion services are unavailable");
      }

      return await services.notion.getTodoList(input);
    },
  },
] as const satisfies readonly RegisteredTool[];
