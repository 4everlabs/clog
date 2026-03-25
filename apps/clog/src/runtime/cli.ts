#!/usr/bin/env bun

import { createInterface } from "readline";
import type { AgentLoop } from "./ai/agent/agentloop";
import type { RuntimeBootstrap } from "./bootstrap";

export interface CliOptions {
  runtime: RuntimeBootstrap;
  agentLoop?: AgentLoop;
}

export class Cli {
  private readonly runtime: RuntimeBootstrap;
  private readonly agentLoop?: AgentLoop;
  private running = false;

  constructor(opts: CliOptions) {
    this.runtime = opts.runtime;
    this.agentLoop = opts.agentLoop;
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

          if (this.agentLoop) {
            const thread = this.runtime.store.listThreads()[0];
            if (thread) {
              await this.runAgent(input, thread.id);
            } else {
              console.log("No thread available.");
            }
          } else {
            console.log("Agent loop not initialized. Use /monitor for monitoring mode.");
          }
          
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

  private async runAgent(task: string, threadId: string): Promise<void> {
    console.log(`\n🤖 Processing: "${task}"`);
    
    try {
      const result = await this.agentLoop!.run({ task, threadId });
      
      console.log(`\n✓ Completed in ${result.iterations} iteration(s)`);
      console.log(`\n💬 Response:\n${result.finalResponse}`);
      
      if (result.toolExecutions.length > 0) {
        console.log(`\n🔧 Tool Executions:`);
        for (const exec of result.toolExecutions) {
          const status = exec.success ? "✓" : "✗";
          console.log(`  ${status} ${exec.toolName} (${exec.durationMs}ms)`);
        }
      }
    } catch (error) {
      console.error(`\n❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}

export const createCli = (runtime: RuntimeBootstrap, agentLoop?: AgentLoop): Cli => {
  return new Cli({ runtime, agentLoop });
};

export const startCli = async (runtime: RuntimeBootstrap): Promise<void> => {
  const cli = createCli(runtime);
  await cli.start();
};
