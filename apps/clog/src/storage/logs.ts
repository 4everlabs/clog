import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { format } from "node:util";
import { resolveRuntimeStorageRoot } from "../../../../tests/runtime-instance-template";
import { RuntimeTerminalOutputFormatter, type RuntimeTerminalStreamName } from "./runtime-terminal-output";

const SESSIONS_DIRECTORY_NAME = "sessions";
const SESSION_LOG_FILE_NAME = "system.log";
const LOG_FILE_BUFFER_SIZE = 1024 * 1024;
const LOG_FLUSH_INTERVAL_MS = 1_000;

type LogChunk = string | Uint8Array;
type WriteCallback = ((error?: Error | null) => void) | undefined;
type WriteMethod = typeof process.stdout.write;
type ConsoleMethodName = "debug" | "error" | "info" | "log" | "trace" | "warn";
const runtimeConsole = Reflect.get(globalThis, "console") as Console;

interface ConsoleMethodSet {
  readonly debug: Console["debug"];
  readonly error: Console["error"];
  readonly info: Console["info"];
  readonly log: Console["log"];
  readonly trace: Console["trace"];
  readonly warn: Console["warn"];
}

export interface RuntimeLogSession {
  readonly startedAt: number;
  readonly startedAtIso: string;
  readonly sessionTitle: string;
  readonly filePath: string;
}

interface RuntimeLogCapture extends RuntimeLogSession {
  readonly sink: Bun.FileSink;
  readonly terminalFormatter: RuntimeTerminalOutputFormatter;
  readonly originalStdoutWrite: WriteMethod;
  readonly originalStderrWrite: WriteMethod;
  readonly originalConsoleMethods: ConsoleMethodSet;
  readonly flushTimer: Timer;
  readonly stdoutWrite: WriteMethod;
  readonly stderrWrite: WriteMethod;
  dirty: boolean;
  closed: boolean;
}

let activeCapture: RuntimeLogCapture | null = null;
let hooksRegistered = false;
let mirroredConsoleDepth = 0;

export interface RuntimeLogSessionPaths {
  readonly sessionTitle: string;
  readonly sessionDirectoryName: string;
  readonly filePath: string;
}

export const createRuntimeLogSessionTitle = (timestamp: number): string =>
  new Date(timestamp).toISOString();

const createRuntimeLogSessionDirectoryName = (timestamp: number): string =>
  createRuntimeLogSessionTitle(timestamp).replaceAll(":", "-").replaceAll(".", "-");

export const createRuntimeLogSessionPaths = (
  storageRoot: string,
  timestamp: number,
): RuntimeLogSessionPaths => {
  const sessionTitle = createRuntimeLogSessionTitle(timestamp);
  const sessionDirectoryName = createRuntimeLogSessionDirectoryName(timestamp);
  return {
    sessionTitle,
    sessionDirectoryName,
    filePath: join(storageRoot, SESSIONS_DIRECTORY_NAME, sessionDirectoryName, SESSION_LOG_FILE_NAME),
  };
};

const reportCaptureError = (error: unknown): void => {
  const capture = activeCapture;
  if (!capture) {
    return;
  }

  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  try {
    capture.originalStderrWrite.call(process.stderr, `[clog][logs] ${message}\n`);
  } catch {
    // Avoid throwing from logging infrastructure failures.
  }
};

const writeToSink = (chunk: LogChunk): void => {
  const capture = activeCapture;
  if (!capture || capture.closed) {
    return;
  }

  try {
    capture.dirty = true;
    const result = capture.sink.write(chunk);
    void Promise.resolve(result).catch(reportCaptureError);
  } catch (error) {
    reportCaptureError(error);
  }
};

const flushSink = (): void => {
  const capture = activeCapture;
  if (!capture || capture.closed || !capture.dirty) {
    return;
  }

  capture.dirty = false;
  try {
    const result = capture.sink.flush();
    void Promise.resolve(result).catch(reportCaptureError);
  } catch (error) {
    capture.dirty = true;
    reportCaptureError(error);
  }
};

const closeRuntimeLogCapture = (): void => {
  const capture = activeCapture;
  if (!capture || capture.closed) {
    return;
  }

  capture.closed = true;
  clearInterval(capture.flushTimer);
  const remainingStdout = capture.terminalFormatter.flush("stdout");
  if (remainingStdout.length > 0) {
    capture.originalStdoutWrite.call(process.stdout, remainingStdout);
  }
  const remainingStderr = capture.terminalFormatter.flush("stderr");
  if (remainingStderr.length > 0) {
    capture.originalStderrWrite.call(process.stderr, remainingStderr);
  }
  process.stdout.write = capture.originalStdoutWrite;
  process.stderr.write = capture.originalStderrWrite;
  runtimeConsole.debug = capture.originalConsoleMethods.debug;
  runtimeConsole.error = capture.originalConsoleMethods.error;
  runtimeConsole.info = capture.originalConsoleMethods.info;
  runtimeConsole.log = capture.originalConsoleMethods.log;
  runtimeConsole.trace = capture.originalConsoleMethods.trace;
  runtimeConsole.warn = capture.originalConsoleMethods.warn;

  try {
    capture.sink.write(`\n=== clog runtime log ended ${new Date().toISOString()} ===\n`);
    const result = capture.sink.end();
    void Promise.resolve(result).catch(reportCaptureError);
  } catch (error) {
    reportCaptureError(error);
  }
};

const registerCloseHooks = (): void => {
  if (hooksRegistered) {
    return;
  }

  hooksRegistered = true;
  process.once("beforeExit", closeRuntimeLogCapture);
  process.once("exit", closeRuntimeLogCapture);
};

const createPatchedWrite = (
  originalWrite: WriteMethod,
  stream: NodeJS.WriteStream,
  streamName: RuntimeTerminalStreamName,
  terminalFormatter: RuntimeTerminalOutputFormatter,
): WriteMethod => {
  return ((chunk: string | Uint8Array, encoding?: BufferEncoding | WriteCallback, callback?: WriteCallback): boolean => {
    if (mirroredConsoleDepth === 0) {
      writeToSink(chunk);
    }
    const resolvedCallback = typeof encoding === "function" ? encoding : callback;
    const rendered = terminalFormatter.formatChunk(streamName, chunk);
    if (rendered.length === 0) {
      resolvedCallback?.();
      return true;
    }
    return originalWrite.call(stream, rendered, "utf8", resolvedCallback);
  }) as WriteMethod;
};

const createPatchedConsoleMethod = (
  originalMethod: Console[ConsoleMethodName],
): Console[ConsoleMethodName] => {
  return ((...args: unknown[]) => {
    mirroredConsoleDepth += 1;
    try {
      writeToSink(`${format(...args)}\n`);
      return originalMethod(...args);
    } finally {
      mirroredConsoleDepth = Math.max(0, mirroredConsoleDepth - 1);
    }
  }) as Console[ConsoleMethodName];
};

export const initializeRuntimeLogCapture = (
  env: NodeJS.ProcessEnv = process.env,
  workspaceRoot = process.cwd(),
): RuntimeLogSession => {
  const existingCapture = activeCapture;
  if (existingCapture && !existingCapture.closed) {
    return {
      startedAt: existingCapture.startedAt,
      startedAtIso: existingCapture.startedAtIso,
      sessionTitle: existingCapture.sessionTitle,
      filePath: existingCapture.filePath,
    };
  }

  const storageRoot = resolveRuntimeStorageRoot(env, workspaceRoot);
  const startedAt = Date.now();
  const session = createRuntimeLogSessionPaths(storageRoot, startedAt);
  mkdirSync(join(storageRoot, SESSIONS_DIRECTORY_NAME), { recursive: true });
  mkdirSync(join(storageRoot, SESSIONS_DIRECTORY_NAME, session.sessionDirectoryName), { recursive: true });
  const filePath = session.filePath;
  const sink = Bun.file(filePath).writer({ highWaterMark: LOG_FILE_BUFFER_SIZE });
  const terminalFormatter = new RuntimeTerminalOutputFormatter(startedAt);
  const originalStdoutWrite = process.stdout.write.bind(process.stdout) as WriteMethod;
  const originalStderrWrite = process.stderr.write.bind(process.stderr) as WriteMethod;
  const originalConsoleMethods: ConsoleMethodSet = {
    debug: runtimeConsole.debug.bind(runtimeConsole),
    error: runtimeConsole.error.bind(runtimeConsole),
    info: runtimeConsole.info.bind(runtimeConsole),
    log: runtimeConsole.log.bind(runtimeConsole),
    trace: runtimeConsole.trace.bind(runtimeConsole),
    warn: runtimeConsole.warn.bind(runtimeConsole),
  };
  const stdoutWrite = createPatchedWrite(originalStdoutWrite, process.stdout, "stdout", terminalFormatter);
  const stderrWrite = createPatchedWrite(originalStderrWrite, process.stderr, "stderr", terminalFormatter);
  const flushTimer = setInterval(flushSink, LOG_FLUSH_INTERVAL_MS);
  flushTimer.unref?.();

  activeCapture = {
    startedAt,
    startedAtIso: session.sessionTitle,
    sessionTitle: session.sessionTitle,
    filePath,
    sink,
    terminalFormatter,
    originalStdoutWrite,
    originalStderrWrite,
    originalConsoleMethods,
    flushTimer,
    stdoutWrite,
    stderrWrite,
    dirty: false,
    closed: false,
  };

  process.stdout.write = stdoutWrite;
  process.stderr.write = stderrWrite;
  runtimeConsole.debug = createPatchedConsoleMethod(originalConsoleMethods.debug);
  runtimeConsole.error = createPatchedConsoleMethod(originalConsoleMethods.error);
  runtimeConsole.info = createPatchedConsoleMethod(originalConsoleMethods.info);
  runtimeConsole.log = createPatchedConsoleMethod(originalConsoleMethods.log);
  runtimeConsole.trace = createPatchedConsoleMethod(originalConsoleMethods.trace);
  runtimeConsole.warn = createPatchedConsoleMethod(originalConsoleMethods.warn);
  registerCloseHooks();

  writeToSink(
    [
      `=== clog runtime log started ${activeCapture.startedAtIso} ===`,
      `session=${activeCapture.sessionTitle}`,
      `pid=${process.pid}`,
      `cwd=${process.cwd()}`,
      `storage=${storageRoot}`,
      "",
    ].join("\n"),
  );

  return {
    startedAt: activeCapture.startedAt,
    startedAtIso: activeCapture.startedAtIso,
    sessionTitle: activeCapture.sessionTitle,
    filePath: activeCapture.filePath,
  };
};

