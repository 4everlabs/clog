import type { PostHogCliCommandResponse, PostHogInsightQueryResult } from "@clog/types";

export type PostHogQueryRow = Record<string, unknown>;

export interface PostHogQueryResponse<T extends PostHogQueryRow = PostHogQueryRow> {
  readonly columns: readonly string[];
  readonly results: readonly T[];
}

export interface PostHogFeatureFlag {
  readonly id: number | string;
  readonly key: string;
  readonly name?: string;
  readonly active?: boolean;
  readonly rollout_percentage?: number | null;
}

export interface PostHogHealthcheckResult {
  readonly ok: boolean;
  readonly summary: string;
  readonly checkedAt: number;
}

export interface PostHogErrorWindowRow extends PostHogQueryRow {
  readonly current_count: number | string;
  readonly previous_count: number | string;
}

export interface PostHogInsightWindowRow extends PostHogQueryRow {
  readonly current_value: number | string;
  readonly previous_value: number | string;
}

export interface PostHogEndpointRunOptions {
  readonly endpointName?: string;
  readonly filePath?: string;
  readonly cwd?: string;
  readonly variables?: Record<string, string>;
  readonly json?: boolean;
}

export interface PostHogEndpointPullOptions {
  readonly endpointName?: string;
  readonly outputDirectory?: string;
  readonly pullAll?: boolean;
}

export interface PostHogSourcemapUploadOptions {
  readonly directory: string;
  readonly releaseName: string;
  readonly releaseVersion?: string;
  readonly deleteAfter?: boolean;
}

export interface PostHogSourcemapInjectOptions {
  readonly directory: string;
}

export interface PostHogCliCommandResult extends PostHogCliCommandResponse {}

export interface PostHogInsightQueryExecution extends PostHogInsightQueryResult {}
