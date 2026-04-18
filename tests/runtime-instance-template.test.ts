import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { syncRuntimeInstanceTemplate } from "./runtime-instance-template";

const writeFile = (path: string, content: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};

describe("syncRuntimeInstanceTemplate", () => {
  test("copies missing starter files and removes legacy runtime paths", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clog-instance-template-"));

    try {
      const starterRoot = join(workspaceRoot, ".runtime", "instances", "00");
      const targetRoot = join(workspaceRoot, ".runtime", "instances", "01");

      writeFile(join(starterRoot, "read-only", "settings.json"), "{\n  \"starter\": true,\n  \"ai\": {\n    \"model\": \"google/gemma-4-31b-it:free\"\n  }\n}\n");
      writeFile(join(starterRoot, "read-only", "tools.json"), "{\n  \"starter\": true\n}\n");
      writeFile(join(starterRoot, "read-only", "wakeup.json"), "{\n  \"prompts\": {},\n  \"schedule\": []\n}\n");
      writeFile(join(starterRoot, "storage", "README.md"), "storage\n");
      writeFile(join(starterRoot, "storage", "conversations", "timestamp.jsonl"), "\n");
      writeFile(join(starterRoot, "workspace", "README.md"), "workspace\n");

      writeFile(join(targetRoot, "settings.json"), "{\n  \"legacy\": true,\n  \"monitor\": {\n    \"intervalMs\": 5000\n  }\n}\n");
      writeFile(join(targetRoot, "wakeup.json"), "{\n  \"prompts\": {},\n  \"schedule\": []\n}\n");
      writeFile(join(targetRoot, "settings", "ai.json"), "{}\n");
      writeFile(join(targetRoot, "settings", "tools.json"), "{ broken json\n");
      writeFile(join(targetRoot, "brain", "README.md"), "legacy brain\n");
      writeFile(join(targetRoot, "storage", "runtime.sqlite"), "legacy sqlite\n");

      syncRuntimeInstanceTemplate(
        {
          CLOG_INSTANCE_ID: "01",
        },
        workspaceRoot,
      );

      expect(existsSync(join(targetRoot, "read-only", "settings.json"))).toBe(true);
      expect(existsSync(join(targetRoot, "read-only", "tools.json"))).toBe(true);
      expect(existsSync(join(targetRoot, "read-only", "wakeup.json"))).toBe(true);
      expect(existsSync(join(targetRoot, "wakeup.json"))).toBe(false);
      expect(existsSync(join(targetRoot, "storage", "conversations", "timestamp.jsonl"))).toBe(true);
      expect(existsSync(join(targetRoot, "settings"))).toBe(false);
      expect(existsSync(join(targetRoot, "settings.json"))).toBe(false);
      expect(existsSync(join(targetRoot, "brain"))).toBe(false);
      expect(existsSync(join(targetRoot, "storage", "runtime.sqlite"))).toBe(false);
      expect(readFileSync(join(targetRoot, "read-only", "settings.json"), "utf-8")).toContain("\"model\": \"google/gemma-4-31b-it:free\"");
      expect(readFileSync(join(targetRoot, "read-only", "settings.json"), "utf-8")).toContain("\"intervalMs\": 5000");
      expect(readFileSync(join(targetRoot, "read-only", "tools.json"), "utf-8")).toBe("{\n  \"starter\": true\n}\n");
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
