#!/usr/bin/env bun

import { createInterface } from "readline";
import type { RuntimeBootstrap } from "./bootstrap";

export interface CliOptions {
  runtime: RuntimeBootstrap;
}

export class Cli {
  private readonly runtime: RuntimeBootstrap;
  private running = false;

  constructor(opts: CliOptions) {
    this.runtime = opts.runtime;
  }

  async start(): Promise<void> {
    this.running = true;
    
    console.clear();
    this.printBanner();
    this.printStatus();
    console.log("Type /help for commands, or just start chatting!\n");

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (): Promise<void> => {
      return new Promise((resolve) => {
        rl.question("\n❯ ", async (input) => {
          if (!input?.trim()) {
            ask();
            return;
          }
          
          if (input === "/help" || input === "/h") {
            this.printHelp();
            ask();
            return;
          }
          
          if (input === "/status") {
            this.printStatus();
            ask();
            return;
          }
          
          if (input === "/findings") {
            this.printFindings();
            ask();
            return;
          }
          
          if (input === "/quit" || input === "/exit" || input === "/q") {
            console.log("Goodbye!");
            this.running = false;
            rl.close();
            process.exit(0);
            return;
          }
          
          if (input === "/monitor") {
            await this.runMonitor();
            ask();
            return;
          }

          if (input.startsWith("/")) {
            console.log(`Unknown command: ${input}. Type /help for available commands.`);
            ask();
            return;
          }

          await this.runChat(input);
          
          ask();
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

  private printStatus(): void {
    const summary = this.runtime.runtimeSummary;
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
  /quit, /q    Exit the CLI
`);
  }

  private printFindings(): void {
    const findings = this.runtime.store.listFindings().filter((f) => f.state === "open");
    
    if (findings.length === 0) {
      console.log("No open findings.");
      return;
    }

    console.log(`\n📋 Open Findings (${findings.length}):\n`);
    for (const f of findings) {
      console.log(`  [${f.severity.toUpperCase()}] ${f.title}`);
      console.log(`    ${f.summary}`);
      console.log(`    State: ${f.state} | First seen: ${new Date(f.firstSeenAt).toLocaleString()}`);
      console.log("");
    }
  }

  private async runMonitor(): Promise<void> {
    console.log("\n🔄 Running monitoring cycle...");
    
    try {
      const result = await this.runtime.monitorLoop.tick();
      
      console.log(`\n✓ Observations: ${result.observations.length}`);
      console.log(`✓ Findings: ${result.findings.length}`);
      
      if (result.findings.length > 0) {
        console.log("\n📋 New Findings:");
        for (const f of result.findings) {
          console.log(`  - [${f.severity}] ${f.title}`);
        }
      }
      
      console.log("\n📊 Integration Health:");
      for (const h of result.integrationHealth) {
        console.log(`  ${h.kind}: ${h.status} - ${h.summary}`);
      }
    } catch (error) {
      console.error(`\n❌ Monitor error: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }

  private async runChat(message: string): Promise<void> {
    console.log(`\n🤖 Processing: "${message}"`);
    
    try {
      const thread = this.runtime.store.listThreads().find((entry) => entry.channel === "cli")
        ?? this.runtime.store.seedOperatorThread("cli");
      const response = await this.runtime.gateway.sendMessage({
        channel: "cli",
        threadId: thread.id,
        message,
      });

      console.log(`\n💬 Response:\n${response.assistantMessage.content}`);
    } catch (error) {
      console.error(`\n❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}

export const createCli = (runtime: RuntimeBootstrap): Cli => {
  return new Cli({ runtime });
};

export const startCli = async (runtime: RuntimeBootstrap): Promise<void> => {
  const cli = createCli(runtime);
  await cli.start();
};
