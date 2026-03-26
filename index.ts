import { parseRuntimeStartupOptions, startDefaultRuntimeServer } from "./apps/clog/src/index.ts";

await startDefaultRuntimeServer(parseRuntimeStartupOptions());
