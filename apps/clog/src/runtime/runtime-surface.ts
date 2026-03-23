import type {
  ActionExecutionRequest,
  ShellCommandRequest,
  SurfaceAcknowledgeFindingRequest,
  SurfaceSendMessageRequest,
} from "@clog/types";
import type { RuntimeBootstrap } from "./bootstrap";

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });

const parseJson = async <T>(request: Request): Promise<T> => {
  return await request.json() as T;
};

export class AgentSurfaceTransport {
  constructor(public readonly runtime: RuntimeBootstrap) {}

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/healthz" && request.method === "GET") {
      return json({
        ok: true,
        runtime: this.runtime.runtimeSummary,
      });
    }

    if (pathname === "/api/bootstrap" && request.method === "GET") {
      return json(await this.runtime.gateway.bootstrap());
    }

    if (pathname === "/api/findings" && request.method === "GET") {
      return json(await this.runtime.gateway.listFindings());
    }

    if (pathname === "/api/threads" && request.method === "GET") {
      return json(await this.runtime.gateway.listThreads());
    }

    if (pathname === "/api/chat" && request.method === "POST") {
      return json(await this.runtime.gateway.sendMessage(await parseJson<SurfaceSendMessageRequest>(request)));
    }

    if (pathname === "/api/shell" && request.method === "POST") {
      return json(await this.runtime.gateway.runShellCommand(await parseJson<ShellCommandRequest>(request)));
    }

    if (pathname === "/api/findings/acknowledge" && request.method === "POST") {
      return json(await this.runtime.gateway.acknowledgeFinding(await parseJson<SurfaceAcknowledgeFindingRequest>(request)));
    }

    if (pathname === "/api/actions/execute" && request.method === "POST") {
      return json(await this.runtime.gateway.executeAction(await parseJson<ActionExecutionRequest>(request)));
    }

    return json({
      error: `Route not found: ${request.method} ${pathname}`,
    }, 404);
  }

  createHandler(): (request: Request) => Promise<Response> {
    return (request) => this.handle(request);
  }
}

export const createRuntimeSurfaceHandler = (runtime: RuntimeBootstrap): ((request: Request) => Promise<Response>) => {
  const transport = new AgentSurfaceTransport(runtime);
  return transport.createHandler();
};
