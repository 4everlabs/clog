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
      const exampleRoot = join(workspaceRoot, ".runtime", "instances", "example-instance");
      const personalRoot = join(workspaceRoot, ".runtime", "instances", "personal-instance");

      writeFile(join(exampleRoot, "read-only", "settings.json"), "{\n  \"starter\": true\n}\n");
      writeFile(join(exampleRoot, "read-only", "tools.json"), "{\n  \"starter\": true\n}\n");
      writeFile(join(exampleRoot, "wakeup.json"), "{\n  \"intervalMs\": 60000,\n  \"message\": \"starter\"\n}\n");
      writeFile(join(exampleRoot, "storage", "README.md"), "storage\n");
      writeFile(join(exampleRoot, "workspace", "README.md"), "workspace\n");

      writeFile(join(personalRoot, "settings.json"), "{\n  \"legacy\": true\n}\n");
      writeFile(join(personalRoot, "settings", "wakeup.json"), "{\n  \"intervalMs\": 5000,\n  \"message\": \"legacy\"\n}\n");
      writeFile(join(personalRoot, "settings", "ai.json"), "{}\n");
      writeFile(join(personalRoot, "settings", "tools.json"), "{ broken json\n");
      writeFile(join(personalRoot, "brain", "README.md"), "legacy brain\n");
      writeFile(join(personalRoot, "storage", "runtime.sqlite"), "legacy sqlite\n");

      syncRuntimeInstanceTemplate(
        {
          POSTHOG_CLAW_INSTANCE_ID: "personal-instance",
        },
        workspaceRoot,
      );

      expect(existsSync(join(personalRoot, "read-only", "settings.json"))).toBe(true);
      expect(existsSync(join(personalRoot, "read-only", "tools.json"))).toBe(true);
      expect(existsSync(join(personalRoot, "wakeup.json"))).toBe(true);
      expect(existsSync(join(personalRoot, "settings"))).toBe(false);
      expect(existsSync(join(personalRoot, "settings.json"))).toBe(false);
      expect(existsSync(join(personalRoot, "brain"))).toBe(false);
      expect(existsSync(join(personalRoot, "storage", "runtime.sqlite"))).toBe(false);
      expect(readFileSync(join(personalRoot, "read-only", "tools.json"), "utf-8")).toBe("{\n  \"starter\": true\n}\n");
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
