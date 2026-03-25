#!/usr/bin/env bun

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

      console.log(`\n💬 Response:\n${response.assistantMessage.content}`);
    } catch (error) {
      console.error(`\n❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
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
