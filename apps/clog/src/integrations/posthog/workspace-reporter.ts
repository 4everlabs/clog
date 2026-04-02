import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OPERATION_HISTORY_LIMIT = 12;
export const POSTHOG_WORKSPACE_SNAPSHOT_FILE_NAME = "posthog-tool-output.json";

export interface PostHogWorkspaceRecord {
  readonly recordedAt: number;
  readonly data: unknown;
}

interface PostHogWorkspaceOperationSnapshot {
  readonly lastRecordedAt: number;
  readonly history: readonly PostHogWorkspaceRecord[];
}

interface LegacyPostHogWorkspaceRecord {
  readonly recordedAt?: number;
  readonly data?: unknown;
}

interface PostHogWorkspaceSnapshot {
  readonly updatedAt: number;
  readonly operations: Record<string, PostHogWorkspaceOperationSnapshot>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const toWorkspaceRecord = (value: unknown): PostHogWorkspaceRecord | null => {
  if (!isRecord(value) || typeof value.recordedAt !== "number") {
    return null;
  }

  return {
    recordedAt: value.recordedAt,
    data: value.data,
  };
};

const toOperationSnapshot = (value: unknown): PostHogWorkspaceOperationSnapshot | null => {
  if (!isRecord(value)) {
    return null;
  }

  const history = Array.isArray(value.history)
    ? value.history
      .map((entry) => toWorkspaceRecord(entry))
      .filter((entry): entry is PostHogWorkspaceRecord => entry !== null)
      .sort((left, right) => left.recordedAt - right.recordedAt)
    : [];

  if (typeof value.lastRecordedAt === "number" && history.length > 0) {
    return {
      lastRecordedAt: value.lastRecordedAt,
      history,
    };
  }

  const legacyRecord = value as LegacyPostHogWorkspaceRecord;
  if (typeof legacyRecord.recordedAt === "number") {
    return {
      lastRecordedAt: legacyRecord.recordedAt,
      history: [{
        recordedAt: legacyRecord.recordedAt,
        data: legacyRecord.data,
      }],
    };
  }

  return null;
};

const readSnapshot = (path: string): PostHogWorkspaceSnapshot => {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.operations) || typeof parsed.updatedAt !== "number") {
      return {
        updatedAt: 0,
        operations: {},
      };
    }

    const operations = Object.fromEntries(
      Object.entries(parsed.operations)
        .map(([key, value]) => {
          const snapshot = toOperationSnapshot(value);
          return snapshot ? [key, snapshot] : null;
        })
        .filter((entry): entry is [string, PostHogWorkspaceOperationSnapshot] => entry !== null),
    );

    return {
      updatedAt: parsed.updatedAt,
      operations,
    };
  } catch {
    return {
      updatedAt: 0,
      operations: {},
    };
  }
};

export class PostHogWorkspaceReporter {
  private readonly snapshotPath: string;

  constructor(private readonly workspaceDir: string) {
    this.snapshotPath = join(workspaceDir, POSTHOG_WORKSPACE_SNAPSHOT_FILE_NAME);
  }

  record(operation: string, data: unknown): void {
    mkdirSync(this.workspaceDir, { recursive: true });
    const recordedAt = Date.now();
    const snapshot = readSnapshot(this.snapshotPath);
    const existingOperation = snapshot.operations[operation];
    const history = [
      ...(existingOperation?.history ?? []),
      {
        recordedAt,
        data,
      },
    ].slice(-OPERATION_HISTORY_LIMIT);

    const nextSnapshot: PostHogWorkspaceSnapshot = {
      updatedAt: recordedAt,
      operations: {
        ...snapshot.operations,
        [operation]: {
          lastRecordedAt: recordedAt,
          history,
        },
      },
    };

    writeFileSync(this.snapshotPath, JSON.stringify(nextSnapshot, null, 2));
  }
}
