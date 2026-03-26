#!/usr/bin/env bun

/* eslint-disable no-console */

import { createInterface } from "readline";
import { ClogApiClient } from "./clog-api";

export interface CliOptions {
  client: ClogApiClient;
}

export class Cli {
  private readonly client: ClogApiClient;
  private currentThreadId: string | undefined;

  constructor(options: CliOptions) {
    this.client = options.client;
  }

  async start(): Promise<void> {
    console.clear();
    this.printBanner();
    await this.printStatus();
    console.log("Type /help for commands, or just start chatting!\n");

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (): Promise<void> => {
      return new Promise((resolve) => {
        rl.question("\n❯ ", async (input) => {
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
            console.log("Goodbye!");
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

          if (input.startsWith("/")) {
            console.log(`Unknown command: ${input}. Type /help for available commands.`);
            resolve(await ask());
            return;
          }

          await this.runChat(input);
          resolve(await ask());
        });
      });
    };

    await ask();
  }

  private printBanner(): void {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    🚀 CLOG v0.1.0                         ║
║            PostHog-Driven Oversight Agent                  ║
╚═══════════════════════════════════════════════════════════╝
`);
  }

  private async printStatus(): Promise<void> {
    const summary = await this.client.getRuntimeHealth();
    console.log(`Status:     ${summary.status}`);
    console.log(`Mode:       ${summary.executionMode}`);
    console.log(`Monitor:    every ${summary.monitorIntervalMs / 1000}s`);
    console.log(`Integrations: ${summary.activeIntegrations.join(", ")}`);
    console.log(`Booted:     ${new Date(summary.bootedAt).toLocaleString()}`);
    console.log("");
  }

  private printHelp(): void {
    console.log(`
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
  /quit, /q     Exit the CLI
`);
  }

  private async printFindings(): Promise<void> {
    const findings = (await this.client.listFindings()).findings.filter((finding) => finding.state === "open");

    if (findings.length === 0) {
      console.log("No open findings.");
      return;
    }

    console.log(`\n📋 Open Findings (${findings.length}):\n`);
    for (const finding of findings) {
      console.log(`  [${finding.severity.toUpperCase()}] ${finding.title}`);
      console.log(`    ${finding.summary}`);
      console.log(`    State: ${finding.state} | First seen: ${new Date(finding.firstSeenAt).toLocaleString()}`);
      console.log("");
    }
  }

  private async runMonitor(): Promise<void> {
    console.log("\n🔄 Running monitoring cycle...");

    try {
      const result = await this.client.runMonitorCycle();

      console.log(`\n✓ Observations: ${result.observations.length}`);
      console.log(`✓ Findings: ${result.findings.length}`);

      if (result.findings.length > 0) {
        console.log("\n📋 New Findings:");
        for (const finding of result.findings) {
          console.log(`  - [${finding.severity}] ${finding.title}`);
        }
      }

      console.log("\n📊 Integration Health:");
      for (const health of result.integrationHealth) {
        console.log(`  ${health.kind}: ${health.status} - ${health.summary}`);
      }
    } catch (error) {
      console.error(`\n❌ Monitor error: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }

  private async runChat(message: string): Promise<void> {
    console.log(`\n🤖 Processing: "${message}"`);

    try {
      const response = await this.client.sendMessage(
        this.currentThreadId
          ? {
              channel: "cli",
              threadId: this.currentThreadId,
              message,
            }
          : {
              channel: "cli",
              title: "Operator Conversation",
              message,
            },
      );
      this.currentThreadId = response.thread.id;

      console.log(`\n💬 Response:\n${response.replyMessage.content}`);
    } catch (error) {
      console.error(`\n❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private printJsonBlock(label: string, value: unknown): void {
    console.log(`\n${label}`);
    console.log(JSON.stringify(value, null, 2));
  }

  private async printPostHogOrganizations(): Promise<void> {
    console.log("\n🦔 Loading PostHog organizations...");

    try {
      const response = await this.client.listPostHogOrganizations();
      this.printJsonBlock("Organizations:", response.organizations);
    } catch (error) {
      console.error(`\n❌ PostHog organizations error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async printPostHogProjects(input: string): Promise<void> {
    const organizationId = input.split(/\s+/u).slice(1).join(" ").trim() || undefined;
    console.log(`\n🦔 Loading PostHog projects${organizationId ? ` for ${organizationId}` : ""}...`);

    try {
      const response = await this.client.listPostHogProjects(organizationId);
      this.printJsonBlock("Projects:", response);
    } catch (error) {
      console.error(`\n❌ PostHog projects error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async printPostHogErrors(): Promise<void> {
    console.log("\n🦔 Loading PostHog error observations...");

    try {
      const response = await this.client.listPostHogErrors();
      this.printJsonBlock("Error observations:", response.observations);
    } catch (error) {
      console.error(`\n❌ PostHog errors error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async printPostHogMcpTools(input: string): Promise<void> {
    const nameFilter = input.replace(/^\/(?:ph-mcp-tools|posthog-mcp-tools)\s*/u, "").trim() || undefined;
    console.log(`\n🦔 Loading PostHog MCP tools${nameFilter ? ` matching "${nameFilter}"` : ""}...`);

    try {
      const response = await this.client.listPostHogMcpTools(nameFilter, true);
      this.printJsonBlock("MCP tools:", response);
    } catch (error) {
      console.error(`\n❌ PostHog MCP tools error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async runPostHogMcpCall(input: string): Promise<void> {
    const payload = input.replace(/^\/(?:ph-mcp-call|posthog-mcp-call)\s+/u, "").trim();
    if (!payload) {
      console.error("\n❌ PostHog MCP call error: provide a tool name after /ph-mcp-call");
      return;
    }

    const [toolNamePart, ...jsonParts] = payload.split(/\s+/u);
    const toolName = toolNamePart?.trim();
    if (!toolName) {
      console.error("\n❌ PostHog MCP call error: provide a tool name after /ph-mcp-call");
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
        console.error(`\n❌ PostHog MCP call error: invalid JSON args (${error instanceof Error ? error.message : "Unknown error"})`);
        return;
      }
    }

    console.log(`\n🦔 Calling PostHog MCP tool ${toolName}...`);

    try {
      const response = await this.client.callPostHogMcpTool(toolName, args);
      this.printJsonBlock("MCP tool result:", response);
    } catch (error) {
      console.error(`\n❌ PostHog MCP call error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async runPostHogQueryCommand(input: string): Promise<void> {
    const query = input.replace(/^\/(?:ph-query|posthog-query)\s+/u, "").trim();
    if (!query) {
      console.error("\n❌ PostHog query error: provide HogQL after /ph-query");
      return;
    }

    console.log(`\n🦔 Running PostHog query: ${query}`);

    try {
      const response = await this.client.queryPostHog({
        name: "CLI PostHog Query",
        query,
      });
      this.printJsonBlock("Query result:", response.result);
    } catch (error) {
      console.error(`\n❌ PostHog query error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async listPostHogEndpoints(input: string): Promise<void> {
    const cwd = input.replace(/^\/(?:ph-endpoints|posthog-endpoints)\s*/u, "").trim() || undefined;
    console.log(`\n🦔 Listing PostHog endpoints${cwd ? ` from ${cwd}` : ""}...`);

    try {
      const response = await this.client.listPostHogEndpoints(cwd);
      this.printJsonBlock("Endpoint list:", response.result);
    } catch (error) {
      console.error(`\n❌ Endpoint list error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async diffPostHogEndpoints(input: string): Promise<void> {
    const path = input.replace(/^\/(?:ph-diff|posthog-diff)\s+/u, "").trim();
    if (!path) {
      console.error("\n❌ Endpoint diff error: provide a local file or directory path after /ph-diff");
      return;
    }

    console.log(`\n🦔 Diffing PostHog endpoints at ${path}...`);

    try {
      const response = await this.client.diffPostHogEndpoints({ path });
      this.printJsonBlock("Endpoint diff:", response.result);
    } catch (error) {
      console.error(`\n❌ Endpoint diff error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async runPostHogEndpoint(input: string): Promise<void> {
    const endpointName = input.replace(/^\/(?:ph-run|posthog-run)\s+/u, "").trim();
    if (!endpointName) {
      console.error("\n❌ Endpoint run error: provide an endpoint name after /ph-run");
      return;
    }

    console.log(`\n🦔 Running PostHog endpoint ${endpointName}...`);

    try {
      const response = await this.client.runPostHogEndpoint({
        endpointName,
        json: true,
      });
      this.printJsonBlock("Endpoint run:", response.result);
    } catch (error) {
      console.error(`\n❌ Endpoint run error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}

export const createCli = (client: ClogApiClient): Cli => {
  return new Cli({ client });
};

export const startCli = async (client: ClogApiClient): Promise<void> => {
  const cli = createCli(client);
  await cli.start();
};
