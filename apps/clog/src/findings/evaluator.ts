import type { AgentFinding, ProposedAction, RuntimeObservation } from "@clog/types";

const defaultActionsForObservation = (observation: RuntimeObservation): ProposedAction[] => {
  const actions: ProposedAction[] = [
    {
      id: `action_notify_${observation.id}`,
      kind: "notify",
      title: "Notify operator",
      summary: "Send a structured summary into the active chat channel.",
      approvalRequired: false,
      target: {
        integration: observation.source.kind === "runtime" ? "chat" : observation.source.kind,
        reference: observation.source.referenceId ?? observation.id,
      },
    },
  ];

  if (observation.kind === "repo-risk" || observation.kind === "error-rate-spike" || observation.kind === "insight-regression") {
    actions.push({
      id: `action_pr_${observation.id}`,
      kind: "open-pr",
      title: "Prepare pull request",
      summary: "Create a fix branch, commit the patch, and open a PR for phone-side approval.",
      approvalRequired: true,
      target: {
        integration: "github",
        reference: observation.id,
      },
    });
  }

  if (observation.kind === "deploy-risk") {
    actions.push({
      id: `action_deploy_${observation.id}`,
      kind: "deploy",
      title: "Trigger deployment",
      summary: "Run the deployment pathway once the operator has approved the remediation plan.",
      approvalRequired: true,
      target: {
        integration: "vercel",
        reference: observation.id,
      },
    });
  }

  return actions;
};

export const buildFindingsFromObservations = (observations: readonly RuntimeObservation[]): AgentFinding[] => {
  return observations.map((observation) => ({
    id: `finding_${observation.id}`,
    title: observation.summary,
    severity: observation.severity,
    state: "open",
    summary: observation.summary,
    details: observation.details,
    firstSeenAt: observation.detectedAt,
    lastSeenAt: observation.detectedAt,
    sources: [observation.source],
    observations: [observation],
    proposedActions: defaultActionsForObservation(observation),
  }));
};
