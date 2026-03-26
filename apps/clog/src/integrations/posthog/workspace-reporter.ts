import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface PostHogWorkspaceRecord {
  readonly recordedAt: number;
  readonly data: unknown;
}

interface PostHogWorkspaceSnapshot {
  readonly updatedAt: number;
  readonly operations: Record<string, PostHogWorkspaceRecord>;
}

const SNAPSHOT_FILE_NAME = "posthog-tool-output.json";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
      Object.entries(parsed.operations).filter((entry): entry is [string, PostHogWorkspaceRecord] => {
        const [, value] = entry;
        return isRecord(value) && typeof value.recordedAt === "number";
      }),
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
    this.snapshotPath = join(workspaceDir, SNAPSHOT_FILE_NAME);
  }

  record(operation: string, data: unknown): void {
    mkdirSync(this.workspaceDir, { recursive: true });
    const recordedAt = Date.now();
    const snapshot = readSnapshot(this.snapshotPath);

    const nextSnapshot: PostHogWorkspaceSnapshot = {
      updatedAt: recordedAt,
      operations: {
        ...snapshot.operations,
        [operation]: {
          recordedAt,
          data,
        },
      },
    };

    writeFileSync(this.snapshotPath, JSON.stringify(nextSnapshot, null, 2));
  }
}
