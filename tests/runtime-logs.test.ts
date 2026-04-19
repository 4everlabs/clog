import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  createRuntimeLogSessionPaths,
  createRuntimeLogSessionTitle,
} from "../apps/clog/src/storage/logs";

describe("runtime log sessions", () => {
  test("uses a UTC timestamp as the session title and session folder name", () => {
    const startedAt = Date.parse("2026-04-19T02:29:45.655Z");
    const storageRoot = "/tmp/clog-storage";

    expect(createRuntimeLogSessionTitle(startedAt)).toBe("2026-04-19T02:29:45.655Z");
    expect(createRuntimeLogSessionPaths(storageRoot, startedAt)).toEqual({
      sessionTitle: "2026-04-19T02:29:45.655Z",
      sessionDirectoryName: "2026-04-19T02-29-45-655Z",
      filePath: join(storageRoot, "sessions", "2026-04-19T02-29-45-655Z", "system.log"),
    });
  });
});
