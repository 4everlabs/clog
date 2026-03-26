/* eslint-disable no-console */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { format } from "node:util";
import { resolveRuntimeStorageRoot } from "../../../../tests/runtime-instance-template";

const LOG_DIRECTORY_NAME = "logs";
const LOG_FILE_BUFFER_SIZE = 1024 * 1024;
const LOG_FLUSH_INTERVAL_MS = 1_000;

type LogChunk = string | Uint8Array;
type WriteCallback = ((error?: Error | null) => void) | undefined;
type WriteMethod = typeof process.stdout.write;
type ConsoleMethodName = "debug" | "error" | "info" | "log" | "trace" | "warn";

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
  readonly filePath: string;
}

interface RuntimeLogCapture extends RuntimeLogSession {
  readonly sink: Bun.FileSink;
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

const toLogFileName = (timestamp: number): string =>
  `${new Date(timestamp).toISOString().replaceAll(":", "-").replaceAll(".", "-")}.log`;

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
  process.stdout.write = capture.originalStdoutWrite;
  process.stderr.write = capture.originalStderrWrite;
  console.debug = capture.originalConsoleMethods.debug;
  console.error = capture.originalConsoleMethods.error;
  console.info = capture.originalConsoleMethods.info;
  console.log = capture.originalConsoleMethods.log;
  console.trace = capture.originalConsoleMethods.trace;
  console.warn = capture.originalConsoleMethods.warn;

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
): WriteMethod => {
  return ((chunk: string | Uint8Array, encoding?: BufferEncoding | WriteCallback, callback?: WriteCallback): boolean => {
    if (mirroredConsoleDepth === 0) {
      writeToSink(chunk);
    }
    return originalWrite.call(stream, chunk, encoding as BufferEncoding, callback);
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
      filePath: existingCapture.filePath,
    };
  }

  const storageRoot = resolveRuntimeStorageRoot(env, workspaceRoot);
  const logsDirectory = join(storageRoot, LOG_DIRECTORY_NAME);
  mkdirSync(logsDirectory, { recursive: true });

  const startedAt = Date.now();
  const filePath = join(logsDirectory, toLogFileName(startedAt));
  const sink = Bun.file(filePath).writer({ highWaterMark: LOG_FILE_BUFFER_SIZE });
  const originalStdoutWrite = process.stdout.write.bind(process.stdout) as WriteMethod;
  const originalStderrWrite = process.stderr.write.bind(process.stderr) as WriteMethod;
  const originalConsoleMethods: ConsoleMethodSet = {
    debug: console.debug.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    log: console.log.bind(console),
    trace: console.trace.bind(console),
    warn: console.warn.bind(console),
  };
  const stdoutWrite = createPatchedWrite(originalStdoutWrite, process.stdout);
  const stderrWrite = createPatchedWrite(originalStderrWrite, process.stderr);
  const flushTimer = setInterval(flushSink, LOG_FLUSH_INTERVAL_MS);
  flushTimer.unref?.();

  activeCapture = {
    startedAt,
    startedAtIso: new Date(startedAt).toISOString(),
    filePath,
    sink,
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
  console.debug = createPatchedConsoleMethod(originalConsoleMethods.debug);
  console.error = createPatchedConsoleMethod(originalConsoleMethods.error);
  console.info = createPatchedConsoleMethod(originalConsoleMethods.info);
  console.log = createPatchedConsoleMethod(originalConsoleMethods.log);
  console.trace = createPatchedConsoleMethod(originalConsoleMethods.trace);
  console.warn = createPatchedConsoleMethod(originalConsoleMethods.warn);
  registerCloseHooks();

  writeToSink(
    [
      `=== clog runtime log started ${activeCapture.startedAtIso} ===`,
      `pid=${process.pid}`,
      `cwd=${process.cwd()}`,
      `storage=${storageRoot}`,
      "",
    ].join("\n"),
  );

  return {
    startedAt: activeCapture.startedAt,
    startedAtIso: activeCapture.startedAtIso,
    filePath: activeCapture.filePath,
  };
};

