import type { AgentFinding, ProposedAction } from "@clog/types";

export interface PlannedAssistantReply {
  readonly summary: string;
  readonly actions: readonly ProposedAction[];
}

export class RemediationPlanner {
  planForFinding(finding: AgentFinding): PlannedAssistantReply {
    return {
      summary: `I found ${finding.severity} signal "${finding.title}". The current scaffold can summarize it, acknowledge it, and stage follow-up actions once the real integrations are wired.`,
      actions: finding.proposedActions,
    };
  }

  planForMessage(message: string, findings: readonly AgentFinding[]): PlannedAssistantReply {
    const openFindings = findings.filter((finding) => finding.state === "open");
    const latest = openFindings[0];

    if (!latest) {
      return {
        summary: `I heard: "${message}". The runtime scaffold is healthy, but there are no active findings yet beyond the current placeholders.`,
        actions: [],
      };
    }

    return {
      summary: `I heard: "${message}". The highest-priority current finding is "${latest.title}". Once GitHub wiring exists, the likely next step is to prepare an isolated PR instead of patching the main branch directly.`,
      actions: latest.proposedActions,
    };
  }
}
