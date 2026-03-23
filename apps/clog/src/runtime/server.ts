import type { RuntimeBootstrap } from "./bootstrap";
import { createRuntimeSurfaceHandler } from "./runtime-surface";

export interface RuntimeServerInfo {
  readonly port: number;
  readonly url: string;
}

export const startRuntimeServer = (runtime: RuntimeBootstrap): RuntimeServerInfo => {
  const handler = createRuntimeSurfaceHandler(runtime);
  const server = Bun.serve({
    port: runtime.env.port,
    fetch: handler,
  });
  const port = server.port ?? runtime.env.port;

  return {
    port,
    url: `http://127.0.0.1:${port}`,
  };
};
