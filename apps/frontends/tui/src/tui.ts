#!/usr/bin/env bun

import { createInterface } from "readline";
import { ClogApiClient } from "./clog-api";

export interface TuiOptions {
  client: ClogApiClient;
}

export class Tui {
  private readonly client: ClogApiClient;
  private currentThreadId: string | undefined;

  constructor(options: TuiOptions) {
    this.client = options.client;
  }

  private clearScreen(): void {
    process.stdout.write("\u001Bc");
  }

  private writeLine(value = ""): void {
    process.stdout.write(`${value}\n`);
  }

  private writeBlock(value: string): void {
    process.stdout.write(value.endsWith("\n") ? value : `${value}\n`);
  }

  private writeErrorLine(value: string): void {
    process.stderr.write(`${value}\n`);
  }

  async start(): Promise<void> {
    this.clearScreen();
    this.printBanner();
    await this.printStatus();
    this.writeLine("Type /help for commands, or just start chatting!\n");

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    let isClosed = false;
    rl.on("close", () => {
      isClosed = true;
    });

    const ask = (): Promise<void> => {
      if (isClosed) {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        try {
          rl.question("\n❯ ", async (input) => {
            if (isClosed) {
              resolve();
              return;
            }

            if (!input?.trim()) {
              resolve(await ask());
              return;
            }

            if (input === "/help" || input === "/h") {
              this.printHelp();
              resolve(await ask());
              return;
            }

            if (input === "/status") {
              await this.printStatus();
              resolve(await ask());
              return;
            }

            if (input === "/findings") {
              await this.printFindings();
              resolve(await ask());
              return;
            }

            if (input === "/quit" || input === "/exit" || input === "/q") {
              this.writeLine("Goodbye!");
              rl.close();
              process.exit(0);
              return;
            }

            if (input === "/monitor") {
              await this.runMonitor();
              resolve(await ask());
              return;
            }

            if (input === "/ph-orgs" || input === "/posthog-orgs") {
              await this.printPostHogOrganizations();
              resolve(await ask());
              return;
            }

            if (input.startsWith("/ph-projects") || input.startsWith("/posthog-projects")) {
              await this.printPostHogProjects(input);
              resolve(await ask());
              return;
            }

            if (input === "/ph-errors" || input === "/posthog-errors") {
              await this.printPostHogErrors();
              resolve(await ask());
              return;
            }

            if (input.startsWith("/ph-mcp-tools") || input.startsWith("/posthog-mcp-tools")) {
              await this.printPostHogMcpTools(input);
              resolve(await ask());
              return;
            }

            if (input.startsWith("/ph-mcp-call ") || input.startsWith("/posthog-mcp-call ")) {
              await this.runPostHogMcpCall(input);
              resolve(await ask());
              return;
            }

            if (input.startsWith("/ph-query ") || input.startsWith("/posthog-query ")) {
              await this.runPostHogQueryCommand(input);
              resolve(await ask());
              return;
            }

            if (input.startsWith("/ph-endpoints") || input.startsWith("/posthog-endpoints")) {
              await this.listPostHogEndpoints(input);
              resolve(await ask());
              return;
            }

            if (input.startsWith("/ph-diff ") || input.startsWith("/posthog-diff ")) {
              await this.diffPostHogEndpoints(input);
              resolve(await ask());
              return;
            }

            if (input.startsWith("/ph-run ") || input.startsWith("/posthog-run ")) {
              await this.runPostHogEndpoint(input);
              resolve(await ask());
              return;
            }

            if (input === "/todo" || input === "/notion-todo") {
              await this.printNotionTodo({ includeDone: false });
              resolve(await ask());
              return;
            }

            if (input === "/todo-all" || input === "/notion-todo-all") {
              await this.printNotionTodo({ includeDone: true });
              resolve(await ask());
              return;
            }

            if (input.startsWith("/todo-status ") || input.startsWith("/notion-todo-status ")) {
              await this.printNotionTodoForStatus(input);
              resolve(await ask());
              return;
            }

            if (input.startsWith("/")) {
              this.writeLine(`Unknown command: ${input}. Type /help for available commands.`);
              resolve(await ask());
              return;
            }

            await this.runChat(input);
            resolve(await ask());
          });
        } catch (error) {
          if (error instanceof Error && error.name === "ERR_USE_AFTER_CLOSE") {
            resolve();
            return;
          }
          throw error;
        }
      });
    };

    await ask();
  }

  private printBanner(): void {
    this.writeBlock(`
╔═══════════════════════════════════════════════════════════╗
║                    🚀 CLOG v0.1.0                         ║
║            PostHog-Driven Oversight Agent                  ║
╚═══════════════════════════════════════════════════════════╝
`);
  }

  private async printStatus(): Promise<void> {
    const summary = await this.client.getRuntimeHealth();
    this.writeLine(`Status:     ${summary.status}`);
    this.writeLine(`Mode:       ${summary.executionMode}`);
    this.writeLine(`Monitor:    every ${summary.monitorIntervalMs / 1000}s`);
    this.writeLine(`Integrations: ${summary.activeIntegrations.join(", ")}`);
    this.writeLine(`Booted:     ${new Date(summary.bootedAt).toLocaleString()}`);
    this.writeLine();
  }

  private printHelp(): void {
    this.writeBlock(`
Available Commands:
  /help, /h     Show this help message
  /status       Show runtime status
  /findings     List active findings
  /monitor      Run a monitoring cycle
  /ph-orgs      List PostHog organizations
  /ph-projects [orgId]
                List PostHog projects
  /ph-errors    List recent PostHog error spikes
  /ph-mcp-tools [filter]
                List PostHog MCP tools, optionally filtered by name
  /ph-mcp-call <tool-name> [json-args]
                Call a PostHog MCP tool directly
  /ph-query <hogql>
                Run a direct PostHog HogQL query
  /ph-endpoints [cwd]
                List PostHog endpoints from the workspace
  /ph-diff <path>
                Diff local endpoint files against PostHog
  /ph-run <endpoint-name>
                Run a remote PostHog endpoint by name
  /todo         Print the open Notion todo list
  /todo-all     Print the full Notion todo list, including done items
  /todo-status <status>
                Print Notion todo items for a specific Progress value
  /quit, /q     Exit the TUI
`);
  }

  private async printFindings(): Promise<void> {
    const findings = (await this.client.listFindings()).findings.filter((finding) => finding.state === "open");

    if (findings.length === 0) {
      this.writeLine("No open findings.");
      return;
    }

    this.writeLine(`\n📋 Open Findings (${findings.length}):\n`);
    for (const finding of findings) {
      this.writeLine(`  [${finding.severity.toUpperCase()}] ${finding.title}`);
      this.writeLine(`    ${finding.summary}`);
      this.writeLine(`    State: ${finding.state} | First seen: ${new Date(finding.firstSeenAt).toLocaleString()}`);
      this.writeLine();
    }
  }

  private async runMonitor(): Promise<void> {
    this.writeLine("\n🔄 Running monitoring cycle...");

    try {
      const result = await this.client.runMonitorCycle();

      this.writeLine(`\n✓ Observations: ${result.observations.length}`);
      this.writeLine(`✓ Findings: ${result.findings.length}`);
      this.writeLine(`✓ Checked at: ${new Date(result.checkedAt).toLocaleString()}`);

      if (result.findings.length > 0) {
        const openFindings = result.findings.filter((f) => f.state === "open");
        if (openFindings.length > 0) {
          this.writeLine(`\n📋 Open Findings (${openFindings.length}):`);
          for (const finding of openFindings) {
            this.writeLine(`  [${finding.severity.toUpperCase()}] ${finding.title}`);
            this.writeLine(`    ${finding.summary}`);
          }
        }

        const resolvedFindings = result.findings.filter((f) => f.state === "resolved");
        if (resolvedFindings.length > 0) {
          this.writeLine(`\n✅ Resolved (${resolvedFindings.length}):`);
          for (const finding of resolvedFindings) {
            this.writeLine(`  ${finding.title}`);
          }
        }
      }

      this.writeLine("\n📊 Integration Health:");
      for (const health of result.integrationHealth) {
        const icon = health.status === "ready" ? "✅" : health.status === "degraded" ? "⚠️" : "❌";
        this.writeLine(`  ${icon} ${health.kind}: ${health.status} - ${health.summary}`);
      }
    } catch (error) {
      this.writeErrorLine(`\n❌ Monitor error: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }

  private async runChat(message: string): Promise<void> {
    this.writeLine(`\n🤖 Processing: "${message}"`);

    try {
      const response = await this.client.sendMessage(
        this.currentThreadId
          ? {
              channel: "cli",
              channel: "tui",
              threadId: this.currentThreadId,
              message,
            }
          : {
              channel: "tui",
              title: "Operator Conversation",
              message,
            },
      );
      this.currentThreadId = response.thread.id;

      this.writeLine(`\n💬 Response:\n${response.replyMessage.content}`);
    } catch (error) {
      this.writeErrorLine(`\n❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private printJsonBlock(label: string, value: unknown): void {
    this.writeLine(`\n${label}`);
    this.writeLine(JSON.stringify(value, null, 2));
  }

  private async printPostHogOrganizations(): Promise<void> {
    this.writeLine("\n🦔 Loading PostHog organizations...");

    try {
      const response = await this.client.listPostHogOrganizations();
      this.printJsonBlock("Organizations:", response.organizations);
    } catch (error) {
      this.writeErrorLine(`\n❌ PostHog organizations error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async printPostHogProjects(input: string): Promise<void> {
    const organizationId = input.split(/\s+/u).slice(1).join(" ").trim() || undefined;
    this.writeLine(`\n🦔 Loading PostHog projects${organizationId ? ` for ${organizationId}` : ""}...`);

    try {
      const response = await this.client.listPostHogProjects(organizationId);
      this.printJsonBlock("Projects:", response);
    } catch (error) {
      this.writeErrorLine(`\n❌ PostHog projects error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async printPostHogErrors(): Promise<void> {
    this.writeLine("\n🦔 Loading PostHog error observations...");

    try {
      const response = await this.client.listPostHogErrors();
      this.printJsonBlock("Error observations:", response.observations);
    } catch (error) {
      this.writeErrorLine(`\n❌ PostHog errors error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async printPostHogMcpTools(input: string): Promise<void> {
    const nameFilter = input.replace(/^\/(?:ph-mcp-tools|posthog-mcp-tools)\s*/u, "").trim() || undefined;
    this.writeLine(`\n🦔 Loading PostHog MCP tools${nameFilter ? ` matching "${nameFilter}"` : ""}...`);

    try {
      const response = await this.client.listPostHogMcpTools(nameFilter, true);
      this.printJsonBlock("MCP tools:", response);
    } catch (error) {
      this.writeErrorLine(`\n❌ PostHog MCP tools error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async runPostHogMcpCall(input: string): Promise<void> {
    const payload = input.replace(/^\/(?:ph-mcp-call|posthog-mcp-call)\s+/u, "").trim();
    if (!payload) {
      this.writeErrorLine("\n❌ PostHog MCP call error: provide a tool name after /ph-mcp-call");
      return;
    }

    const [toolNamePart, ...jsonParts] = payload.split(/\s+/u);
    const toolName = toolNamePart?.trim();
    if (!toolName) {
      this.writeErrorLine("\n❌ PostHog MCP call error: provide a tool name after /ph-mcp-call");
      return;
    }

    const jsonInput = jsonParts.join(" ").trim();
    let args: Record<string, unknown> | undefined;
    if (jsonInput) {
      try {
        const parsed = JSON.parse(jsonInput) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("JSON args must be an object");
        }
        args = parsed as Record<string, unknown>;
      } catch (error) {
        this.writeErrorLine(`\n❌ PostHog MCP call error: invalid JSON args (${error instanceof Error ? error.message : "Unknown error"})`);
        return;
      }
    }

    this.writeLine(`\n🦔 Calling PostHog MCP tool ${toolName}...`);

    try {
      const response = await this.client.callPostHogMcpTool(toolName, args);
      this.printJsonBlock("MCP tool result:", response);
    } catch (error) {
      this.writeErrorLine(`\n❌ PostHog MCP call error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async runPostHogQueryCommand(input: string): Promise<void> {
    const query = input.replace(/^\/(?:ph-query|posthog-query)\s+/u, "").trim();
    if (!query) {
      this.writeErrorLine("\n❌ PostHog query error: provide HogQL after /ph-query");
      return;
    }

    this.writeLine(`\n🦔 Running PostHog query: ${query}`);

    try {
      const response = await this.client.queryPostHog({
        name: "CLI PostHog Query",
        name: "TUI PostHog Query",
        query,
      });
      this.printJsonBlock("Query result:", response.result);
    } catch (error) {
      this.writeErrorLine(`\n❌ PostHog query error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async listPostHogEndpoints(input: string): Promise<void> {
    const cwd = input.replace(/^\/(?:ph-endpoints|posthog-endpoints)\s*/u, "").trim() || undefined;
    this.writeLine(`\n🦔 Listing PostHog endpoints${cwd ? ` from ${cwd}` : ""}...`);

    try {
      const response = await this.client.listPostHogEndpoints(cwd);
      this.printJsonBlock("Endpoint list:", response.result);
    } catch (error) {
      this.writeErrorLine(`\n❌ Endpoint list error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async diffPostHogEndpoints(input: string): Promise<void> {
    const path = input.replace(/^\/(?:ph-diff|posthog-diff)\s+/u, "").trim();
    if (!path) {
      this.writeErrorLine("\n❌ Endpoint diff error: provide a local file or directory path after /ph-diff");
      return;
    }

    this.writeLine(`\n🦔 Diffing PostHog endpoints at ${path}...`);

    try {
      const response = await this.client.diffPostHogEndpoints({ path });
      this.printJsonBlock("Endpoint diff:", response.result);
    } catch (error) {
      this.writeErrorLine(`\n❌ Endpoint diff error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async runPostHogEndpoint(input: string): Promise<void> {
    const endpointName = input.replace(/^\/(?:ph-run|posthog-run)\s+/u, "").trim();
    if (!endpointName) {
      this.writeErrorLine("\n❌ Endpoint run error: provide an endpoint name after /ph-run");
      return;
    }

    this.writeLine(`\n🦔 Running PostHog endpoint ${endpointName}...`);

    try {
      const response = await this.client.runPostHogEndpoint({
        endpointName,
        json: true,
      });
      this.printJsonBlock("Endpoint run:", response.result);
    } catch (error) {
      this.writeErrorLine(`\n❌ Endpoint run error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async printNotionTodo(input: {
    readonly includeDone: boolean;
    readonly progress?: readonly string[];
  }): Promise<void> {
    this.writeLine(`\n📝 Loading Notion todo list${input.includeDone ? " (all items)" : ""}...`);

    try {
      const response = await this.client.getNotionTodoList(input);
      this.writeLine(`\n${response.printout}\n`);
    } catch (error) {
      this.writeErrorLine(`\n❌ Notion todo error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async printNotionTodoForStatus(input: string): Promise<void> {
    const progress = input.replace(/^\/(?:todo-status|notion-todo-status)\s+/u, "").trim();
    if (!progress) {
      this.writeErrorLine("\n❌ Notion todo error: provide a Progress value after /todo-status");
      return;
    }

    await this.printNotionTodo({
      includeDone: true,
      progress: [progress],
    });
  }
}

export const createTui = (client: ClogApiClient): Tui => {
  return new Tui({ client });
};

export const startTui = async (client: ClogApiClient): Promise<void> => {
  const tui = createTui(client);
  await tui.start();
};
