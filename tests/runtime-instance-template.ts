import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const STARTER_INSTANCE_ID = "00";

const readOptionalString = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const resolveRuntimeInstanceRoot = (
  env: NodeJS.ProcessEnv = process.env,
  workspaceRoot = process.cwd(),
): string => {
  const explicitRoot = readOptionalString(env.CLOG_INSTANCE_ROOT);
  if (explicitRoot) {
    return resolve(workspaceRoot, explicitRoot);
  }

  const instanceId = readOptionalString(env.CLOG_INSTANCE_ID) ?? "personal-instance";
  return resolve(workspaceRoot, `.runtime/instances/${instanceId}`);
};

export const resolveRuntimeReadOnlyRoot = (
  env: NodeJS.ProcessEnv = process.env,
  workspaceRoot = process.cwd(),
): string => join(resolveRuntimeInstanceRoot(env, workspaceRoot), "read-only");

export const resolveRuntimeWorkspaceRoot = (
  env: NodeJS.ProcessEnv = process.env,
  workspaceRoot = process.cwd(),
): string => join(resolveRuntimeInstanceRoot(env, workspaceRoot), "workspace");

export const resolveRuntimeStorageRoot = (
  env: NodeJS.ProcessEnv = process.env,
  workspaceRoot = process.cwd(),
): string => join(resolveRuntimeInstanceRoot(env, workspaceRoot), "storage");

export const resolveRuntimeWakeupPath = (
  env: NodeJS.ProcessEnv = process.env,
  workspaceRoot = process.cwd(),
): string => join(resolveRuntimeReadOnlyRoot(env, workspaceRoot), "wakeup.json");

const resolveStarterInstanceRoot = (workspaceRoot = process.cwd()): string =>
  resolve(workspaceRoot, `.runtime/instances/${STARTER_INSTANCE_ID}`);

const listRelativeFiles = (root: string, prefix = ""): string[] => {
  const currentDir = prefix ? join(root, prefix) : root;
  const entries = readdirSync(currentDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = prefix ? join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...listRelativeFiles(root, relativePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files.sort();
};

const ensureDirectory = (path: string): void => {
  mkdirSync(path, { recursive: true });
};

const isJsonFile = (path: string): boolean => path.endsWith(".json");

const hasValidJson = (path: string): boolean => {
  try {
    JSON.parse(readFileSync(path, "utf-8"));
    return true;
  } catch {
    return false;
  }
};

const readOptionalJson = (path: string): unknown | null => {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    return null;
  }
};

const cloneJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneJsonValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneJsonValue(entry)]),
    );
  }

  return value;
};

const mergeMissingJsonDefaults = (target: unknown, source: unknown): unknown => {
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    return cloneJsonValue(target);
  }

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return cloneJsonValue(target);
  }

  const merged: Record<string, unknown> = {
    ...(target as Record<string, unknown>),
  };

  for (const [key, sourceValue] of Object.entries(source as Record<string, unknown>)) {
    const targetValue = merged[key];
    if (typeof targetValue === "undefined") {
      merged[key] = cloneJsonValue(sourceValue);
      continue;
    }

    if (
      targetValue
      && typeof targetValue === "object"
      && !Array.isArray(targetValue)
      && sourceValue
      && typeof sourceValue === "object"
      && !Array.isArray(sourceValue)
    ) {
      merged[key] = mergeMissingJsonDefaults(targetValue, sourceValue);
    }
  }

  return merged;
};

const mergeMissingJsonFileDefaults = (sourcePath: string, targetPath: string): boolean => {
  const source = readOptionalJson(sourcePath);
  const target = readOptionalJson(targetPath);
  if (source === null || target === null) {
    return false;
  }

  const merged = mergeMissingJsonDefaults(target, source);
  const nextContent = `${JSON.stringify(merged, null, 2)}\n`;
  if (nextContent === `${JSON.stringify(target, null, 2)}\n`) {
    return true;
  }

  writeFileSync(targetPath, nextContent, "utf-8");
  return true;
};

const moveLegacyFile = (from: string, to: string): void => {
  if (!existsSync(from)) {
    return;
  }

  ensureDirectory(dirname(to));
  if (!existsSync(to)) {
    renameSync(from, to);
    return;
  }

  rmSync(from, { force: true });
};

const removeLegacyPaths = (instanceRoot: string): void => {
  rmSync(join(instanceRoot, "brain"), { recursive: true, force: true });
  rmSync(join(instanceRoot, "wakeup.md"), { force: true });
  rmSync(join(instanceRoot, "settings", "ai.json"), { force: true });
  rmSync(join(instanceRoot, "settings", "keys.json"), { force: true });
  rmSync(join(instanceRoot, "settings", "wakeup.md"), { force: true });
  rmSync(join(instanceRoot, "storage", "runtime.sqlite"), { force: true });
  moveLegacyFile(join(instanceRoot, "settings", "settings.json"), join(instanceRoot, "read-only", "settings.json"));
  moveLegacyFile(join(instanceRoot, "settings", "tools.json"), join(instanceRoot, "read-only", "tools.json"));
  moveLegacyFile(join(instanceRoot, "settings", "wakeup.json"), join(instanceRoot, "read-only", "wakeup.json"));
  moveLegacyFile(join(instanceRoot, "settings.json"), join(instanceRoot, "read-only", "settings.json"));
  moveLegacyFile(join(instanceRoot, "tools.json"), join(instanceRoot, "read-only", "tools.json"));
  moveLegacyFile(join(instanceRoot, "wakeup.json"), join(instanceRoot, "read-only", "wakeup.json"));
  rmSync(join(instanceRoot, "settings"), { recursive: true, force: true });
};

export interface SyncRuntimeInstanceTemplateOptions {
  readonly overwriteExisting?: boolean;
}

export const syncRuntimeInstanceTemplate = (
  env: NodeJS.ProcessEnv = process.env,
  workspaceRoot = process.cwd(),
  options: SyncRuntimeInstanceTemplateOptions = {},
): void => {
  const starterRoot = resolveStarterInstanceRoot(workspaceRoot);
  const instanceRoot = resolveRuntimeInstanceRoot(env, workspaceRoot);

  ensureDirectory(instanceRoot);
  ensureDirectory(join(instanceRoot, "read-only"));
  ensureDirectory(join(instanceRoot, "storage"));
  ensureDirectory(join(instanceRoot, "workspace"));
  removeLegacyPaths(instanceRoot);

  if (!existsSync(starterRoot) || starterRoot === instanceRoot) {
    return;
  }

  const starterFiles = listRelativeFiles(starterRoot);
  for (const relativePath of starterFiles) {
    const sourcePath = join(starterRoot, relativePath);
    const targetPath = join(instanceRoot, relativePath);

    ensureDirectory(dirname(targetPath));
    const targetExists = existsSync(targetPath);
    const shouldOverwriteInvalidJson = targetExists && isJsonFile(targetPath) && !hasValidJson(targetPath);

    if (
      targetExists
      && !options.overwriteExisting
      && relativePath === join("read-only", "settings.json")
      && mergeMissingJsonFileDefaults(sourcePath, targetPath)
    ) {
      continue;
    }

    if (!options.overwriteExisting && targetExists && !shouldOverwriteInvalidJson) {
      continue;
    }

    copyFileSync(sourcePath, targetPath);
  }
};
