import {
  GitHubCreatePullRequestInputSchema,
  GitHubCreatePullRequestResultSchema,
  GitHubReadRepositoryInputSchema,
  GitHubReadRepositoryResultSchema,
} from "../../schema/tools";
import type { RegisteredTool } from "../types";

export const githubTools = [
  {
    name: "github_read_repository",
    title: "GitHub Read Repository",
    description: "Read repository context when the runtime has GitHub repository access. Hidden until a concrete implementation is wired.",
    integration: "github",
    exposureTier: "core",
    capabilityGroup: "repository",
    approvalRequired: false,
    implemented: false,
    inputSchema: GitHubReadRepositoryInputSchema,
    outputSchema: GitHubReadRepositoryResultSchema,
    isEnabled(capabilities) {
      return capabilities.github.canReadRepository;
    },
  },
  {
    name: "github_create_pull_request",
    title: "GitHub Create Pull Request",
    description: "Create a pull request when the runtime has GitHub write capability. Hidden until a concrete implementation is wired.",
    integration: "github",
    exposureTier: "core",
    capabilityGroup: "repository",
    approvalRequired: true,
    implemented: false,
    inputSchema: GitHubCreatePullRequestInputSchema,
    outputSchema: GitHubCreatePullRequestResultSchema,
    isEnabled(capabilities) {
      return capabilities.github.canCreatePullRequest;
    },
  },
] as const satisfies readonly RegisteredTool[];
