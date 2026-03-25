import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const STARTER_INSTANCE_ID = "example-instance";

const readOptionalString = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const resolveRuntimeInstanceRoot = (
  env: NodeJS.ProcessEnv = process.env,
  workspaceRoot = process.cwd(),
): string => {
  const explicitRoot = readOptionalString(env.POSTHOG_CLAW_INSTANCE_ROOT);
  if (explicitRoot) {
    return resolve(workspaceRoot, explicitRoot);
  }

  const instanceId = readOptionalString(env.POSTHOG_CLAW_INSTANCE_ID) ?? "personal-instance";
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
): string => join(resolveRuntimeInstanceRoot(env, workspaceRoot), "wakeup.json");

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
  moveLegacyFile(join(instanceRoot, "settings", "settings.json"), join(instanceRoot, "read-only", "settings.json"));
  moveLegacyFile(join(instanceRoot, "settings", "tools.json"), join(instanceRoot, "read-only", "tools.json"));
  moveLegacyFile(join(instanceRoot, "settings", "wakeup.json"), join(instanceRoot, "wakeup.json"));
  moveLegacyFile(join(instanceRoot, "settings.json"), join(instanceRoot, "read-only", "settings.json"));
  moveLegacyFile(join(instanceRoot, "tools.json"), join(instanceRoot, "read-only", "tools.json"));
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

    if (!options.overwriteExisting && targetExists && !shouldOverwriteInvalidJson) {
      continue;
    }

    copyFileSync(sourcePath, targetPath);
  }
};
