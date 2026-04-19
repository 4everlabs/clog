import { ShellExecuteInputSchema, ShellExecuteResultSchema } from "../schema/tools";
import type { RegisteredTool } from "../types";

const toRecord = (entries: readonly { key: string; value: string }[] | undefined): Record<string, string> | undefined => {
  if (!entries || entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
};

export const shellTools = [
  {
    name: "shell_execute_command",
    title: "Shell Execute Command",
    description: "Run a safe shell command within the runtime-approved working roots. Only approved commands succeed.",
    integration: "shell",
    exposureTier: "core",
    capabilityGroup: "shell",
    approvalRequired: false,
    implemented: true,
    inputSchema: ShellExecuteInputSchema,
    outputSchema: ShellExecuteResultSchema,
    isEnabled(capabilities) {
      return capabilities.shell.canExecute;
    },
    execute(services, input) {
      if (!services.shell) {
        throw new Error("Shell services are unavailable");
      }

      return services.shell.execute({
        ...input,
        env: toRecord(input.env),
      });
    },
  },
] as const satisfies readonly RegisteredTool[];
