import type {
  ActionExecutionRequest,
  PostHogEndpointDiffRequest,
  PostHogEndpointRunRequest,
  PostHogInsightQueryRequest,
  ShellCommandRequest,
  SurfaceAcknowledgeFindingRequest,
  SurfaceSendMessageRequest,
  SurfaceUpdateWakeupRequest,
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

    if (pathname === "/" && request.method === "GET") {
      return json({
        ok: true,
        name: this.runtime.runtimeSummary.name,
        message: "CLOG runtime API is running. The web UI is served separately.",
        healthz: "/healthz",
        apiPrefix: "/api",
        websocket: "/ws",
      });
    }

    if (pathname === "/healthz" && request.method === "GET") {
      return json({
        ok: true,
        runtime: this.runtime.runtimeSummary,
      });
    }

    if (pathname === "/api/bootstrap" && request.method === "GET") {
      return json(await this.runtime.gateway.bootstrap());
    }

    if (pathname === "/api/monitor/tick" && request.method === "POST") {
      return json(await this.runtime.gateway.runMonitorCycle());
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

    if (pathname === "/api/wakeup" && request.method === "POST") {
      return json(await this.runtime.gateway.updateWakeupConfig(await parseJson<SurfaceUpdateWakeupRequest>(request)));
    }

    if (pathname === "/api/shell" && request.method === "POST") {
      return json(await this.runtime.gateway.runShellCommand(await parseJson<ShellCommandRequest>(request)));
    }

    if (pathname === "/api/posthog/organizations" && request.method === "GET") {
      return json(await this.runtime.gateway.listPostHogOrganizations());
    }

    if (pathname === "/api/posthog/projects" && request.method === "GET") {
      return json(await this.runtime.gateway.listPostHogProjects(url.searchParams.get("organizationId") ?? undefined));
    }

    if (pathname === "/api/posthog/catalog" && request.method === "GET") {
      const priority = url.searchParams.get("priority");
      return json(await this.runtime.gateway.getPostHogDocumentedToolCatalog({
        feature: url.searchParams.get("feature") ?? undefined,
        priority: priority === "core" || priority === "high" || priority === "extended" ? priority : undefined,
        includeExtended: url.searchParams.get("includeExtended") === "false" ? false : undefined,
      }));
    }

    if (pathname === "/api/posthog/errors" && request.method === "GET") {
      return json(await this.runtime.gateway.listPostHogErrors());
    }

    if (pathname === "/api/posthog/mcp/tools" && request.method === "GET") {
      const includeInputSchema = url.searchParams.get("includeInputSchema") === "true";
      return json(
        await this.runtime.gateway.listPostHogMcpTools(
          url.searchParams.get("nameFilter") ?? undefined,
          includeInputSchema,
        ),
      );
    }

    if (pathname === "/api/posthog/mcp/call" && request.method === "POST") {
      const input = await parseJson<{ readonly toolName: string; readonly arguments?: Record<string, unknown> }>(request);
      return json(await this.runtime.gateway.callPostHogMcpTool(input.toolName, input.arguments));
    }

    if (pathname === "/api/posthog/query" && request.method === "POST") {
      return json(await this.runtime.gateway.queryPostHogInsight(await parseJson<PostHogInsightQueryRequest>(request)));
    }

    if (pathname === "/api/posthog/endpoints" && request.method === "GET") {
      return json(await this.runtime.gateway.listPostHogEndpoints(url.searchParams.get("cwd") ?? undefined));
    }

    if (pathname === "/api/posthog/endpoints/diff" && request.method === "POST") {
      return json(await this.runtime.gateway.diffPostHogEndpoints(await parseJson<PostHogEndpointDiffRequest>(request)));
    }

    if (pathname === "/api/posthog/endpoints/run" && request.method === "POST") {
      return json(await this.runtime.gateway.runPostHogEndpoint(await parseJson<PostHogEndpointRunRequest>(request)));
    }

    if (pathname === "/api/notion/todo" && request.method === "GET") {
      const includeDone = url.searchParams.get("includeDone") === "true";
      const limitValue = url.searchParams.get("limit");
      const parsedLimit = limitValue ? Number.parseInt(limitValue, 10) : Number.NaN;
      const progress = url.searchParams.getAll("progress").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
      return json(await this.runtime.gateway.getNotionTodoList({
        includeDone,
        limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
        progress: progress.length > 0 ? progress : undefined,
      }));
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

export interface RuntimeServerInfo {
  readonly port: number;
  readonly url: string;
  readonly wsUrl: string;
}

interface WSClient {
  id: string;
  send(data: unknown): void;
}

export class WebSocketManager {
  private clients = new Map<string, WSClient>();

  addClient(ws: WebSocket): void {
    const id = crypto.randomUUID();
    this.clients.set(id, {
      id,
      send: (data) => ws.send(JSON.stringify(data)),
    });
  }

  removeClient(id: string): void {
    this.clients.delete(id);
  }

  broadcast(event: string, data: unknown): void {
    const payload = JSON.stringify({ event, data });
    for (const client of this.clients.values()) {
      try {
        client.send(payload);
      } catch {
        // Client might be disconnected.
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const startRuntimeServer = (runtime: RuntimeBootstrap): RuntimeServerInfo => {
  const handler = createRuntimeSurfaceHandler(runtime);
  const wsManager = new WebSocketManager();

  const server = Bun.serve({
    port: runtime.env.port,
    websocket: {
      open(ws) {
        const id = crypto.randomUUID();
        (ws as unknown as { id: string }).id = id;
        wsManager.addClient(ws as unknown as WebSocket);
        wsManager.broadcast("client-connected", { count: wsManager.getClientCount() });
      },
      close(ws) {
        const id = (ws as unknown as { id?: string }).id;
        if (id) {
          wsManager.removeClient(id);
        }
      },
      message() {
        // Reserved for future client-originated events.
      },
    },
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        return new Response(null, { status: 400, statusText: "WebSocket upgrade expected" });
      }

      return handler(req);
    },
  });

  const port = server.port ?? runtime.env.port;

  return {
    port,
    url: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}/ws`,
  };
};
