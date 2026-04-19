import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const STARTER_INSTANCE_ID = "00";
const DEFAULT_BUNDLE_DIRECTORY = "out";
const DEFAULT_BUNDLE_PREFIX = "clog-gce-bundle";

const EXCLUDED_DIRECTORY_SEGMENTS = new Set([
  ".cache",
  ".cursor",
  ".git",
  ".idea",
  "coverage",
  "dist",
  "logs",
  "node_modules",
  "out",
]);

const EXCLUDED_ENV_FILES = new Set([
  ".env",
  ".env.development.local",
  ".env.local",
  ".env.production.local",
  ".env.test.local",
]);

const normalizeRelativePath = (value: string): string => value.split(sep).join("/");

const timestampSuffix = (): string =>
  new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");

const isExcludedRuntimeInstancePath = (relativePath: string): boolean => {
  const segments = relativePath.split("/");
  if (segments[0] !== ".runtime" || segments[1] !== "instances") {
    return false;
  }

  const instanceId = segments[2];
  if (!instanceId) {
    return false;
  }

  if (instanceId !== STARTER_INSTANCE_ID) {
    return true;
  }

  return false;
};

const shouldIncludeRelativePath = (relativePath: string): boolean => {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.split("/");
  const root = segments[0];
  if (!root) {
    return false;
  }

  if (segments.some((segment) => EXCLUDED_DIRECTORY_SEGMENTS.has(segment))) {
    return false;
  }

  const name = basename(normalized);
  if (EXCLUDED_ENV_FILES.has(name) || name === ".DS_Store") {
    return false;
  }

  if (name.endsWith(".tgz")) {
    return false;
  }

  if (isExcludedRuntimeInstancePath(normalized)) {
    return false;
  }

  return true;
};

const listBundleFiles = (workspaceRoot: string, currentDirectory = workspaceRoot): string[] => {
  const entries = readdirSync(currentDirectory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(currentDirectory, entry.name);
    const relativePath = normalizeRelativePath(relative(workspaceRoot, absolutePath));
    if (!shouldIncludeRelativePath(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...listBundleFiles(workspaceRoot, absolutePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
};

export interface GceBundleResult {
  readonly outputPath: string;
  readonly manifestPath: string;
  readonly fileCount: number;
}

export interface CreateGceBundleOptions {
  readonly workspaceRoot?: string;
  readonly outputPath?: string;
}

export const getDefaultGceBundleOutputPath = (workspaceRoot = process.cwd()): string => {
  return resolve(workspaceRoot, DEFAULT_BUNDLE_DIRECTORY, `${DEFAULT_BUNDLE_PREFIX}-${timestampSuffix()}.tgz`);
};

export const collectGceBundleFiles = (workspaceRoot = process.cwd()): string[] => {
  return listBundleFiles(resolve(workspaceRoot));
};

export const createGceBundle = (options: CreateGceBundleOptions = {}): GceBundleResult => {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const outputPath = resolve(options.outputPath ?? getDefaultGceBundleOutputPath(workspaceRoot));
  const manifestPath = `${outputPath}.manifest.txt`;
  const starterRoot = join(workspaceRoot, ".runtime", "instances", STARTER_INSTANCE_ID);

  if (!existsSync(starterRoot) || !statSync(starterRoot).isDirectory()) {
    throw new Error(`Missing starter instance at ${starterRoot}`);
  }

  const files = collectGceBundleFiles(workspaceRoot);
  if (files.length === 0) {
    throw new Error(`No files matched the GCE bundle rules in ${workspaceRoot}`);
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(manifestPath, `${files.join("\n")}\n`, "utf-8");

  const result = spawnSync("tar", ["-czf", outputPath, "-C", workspaceRoot, "-T", manifestPath], {
    cwd: workspaceRoot,
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    const errorOutput = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(errorOutput || `tar exited with status ${String(result.status)}`);
  }

  return {
    outputPath,
    manifestPath,
    fileCount: files.length,
  };
};
