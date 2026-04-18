import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { collectGceBundleFiles, createGceBundle } from "../apps/clog/src/deploy/gce-bundle";

const cleanupPaths: string[] = [];

const writeFile = (path: string, content: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf-8");
};

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (path) {
      rmSync(path, { recursive: true, force: true });
    }
  }
});

describe("gce bundle", () => {
  test("collects source files while excluding private runtime state", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clog-gce-bundle-"));
    cleanupPaths.push(workspaceRoot);

    writeFile(join(workspaceRoot, "package.json"), "{}\n");
    writeFile(join(workspaceRoot, ".env"), "secret\n");
    writeFile(join(workspaceRoot, "dist", "index.js"), "built\n");
    writeFile(join(workspaceRoot, ".cursor", "settings.json"), "{}\n");
    writeFile(join(workspaceRoot, ".runtime", "instances", "00", "read-only", "settings.json"), "{}\n");
    writeFile(join(workspaceRoot, ".runtime", "instances", "00", "storage", "README.md"), "starter\n");
    writeFile(join(workspaceRoot, ".runtime", "instances", "00", "storage", "conversations", "timestamp.jsonl"), "state\n");
    writeFile(join(workspaceRoot, ".runtime", "instances", "personal-instance", "read-only", "settings.json"), "{}\n");
    writeFile(join(workspaceRoot, ".runtime", "instances", "00", "read-only", "settings.json"), "{}\n");
    writeFile(join(workspaceRoot, "apps", "frontends", "web", "dist", "index.html"), "web\n");
    writeFile(join(workspaceRoot, "apps", "frontends", "web", "node_modules", "dep", "index.js"), "dep\n");

    expect(collectGceBundleFiles(workspaceRoot)).toEqual([
      ".runtime/instances/00/read-only/settings.json",
      ".runtime/instances/00/storage/conversations/timestamp.jsonl",
      ".runtime/instances/00/storage/README.md",
      "package.json",
    ]);
  });

  test("creates a tarball and manifest for upload", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "clog-gce-bundle-"));
    cleanupPaths.push(workspaceRoot);

    writeFile(join(workspaceRoot, "package.json"), "{}\n");
    writeFile(join(workspaceRoot, "apps", "clog", "src", "index.ts"), "export {};\n");
    writeFile(join(workspaceRoot, ".runtime", "instances", "00", "read-only", "settings.json"), "{}\n");
    writeFile(join(workspaceRoot, ".runtime", "instances", "00", "read-only", "tools.json"), "{}\n");
    writeFile(join(workspaceRoot, ".runtime", "instances", "00", "read-only", "wakeup.json"), "{}\n");
    writeFile(join(workspaceRoot, ".runtime", "instances", "00", "storage", "conversations", "timestamp.jsonl"), "{}\n");

    const outputPath = join(workspaceRoot, "out", "bundle.tgz");
    const bundle = createGceBundle({
      workspaceRoot,
      outputPath,
    });

    expect(bundle.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);
    expect(existsSync(bundle.manifestPath)).toBe(true);
    expect(readFileSync(bundle.manifestPath, "utf-8")).toContain(".runtime/instances/00/read-only/settings.json");

    const listed = spawnSync("tar", ["-tzf", outputPath], {
      cwd: workspaceRoot,
      encoding: "utf-8",
    });

    expect(listed.status).toBe(0);
    expect(listed.stdout).toContain("package.json");
    expect(listed.stdout).toContain(".runtime/instances/00/read-only/wakeup.json");
    expect(listed.stdout).toContain(".runtime/instances/00/storage/conversations/timestamp.jsonl");
  });
});
