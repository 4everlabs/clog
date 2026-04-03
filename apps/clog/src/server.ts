import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ActionExecutionRequest,
  PostHogEndpointDiffRequest,
  PostHogEndpointRunRequest,
  PostHogInsightQueryRequest,
  ShellCommandRequest,
  SurfaceAcknowledgeFindingRequest,
  SurfaceSendMessageRequest,
} from "@clog/types";
import type { RuntimeBootstrap } from "./bootstrap";

const WEB_DIST_ROOT = fileURLToPath(new URL("../../frontends/web/dist/", import.meta.url));
const WEB_DIST_INDEX = join(WEB_DIST_ROOT, "index.html");

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });

const html = (payload: string, status = 200): Response =>
  new Response(payload, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });

const parseJson = async <T>(request: Request): Promise<T> => {
  return await request.json() as T;
};

const responseFromFile = (file: ReturnType<typeof Bun.file>): Response =>
  new Response(file, {
    headers: file.type ? { "content-type": file.type } : undefined,
  });

const sanitizeWebAssetPath = (pathname: string): string | null => {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  return segments.join("/");
};

const serveBuiltWebDashboard = async (pathname: string): Promise<Response | null> => {
  if (!existsSync(WEB_DIST_INDEX)) {
    return null;
  }

  if (pathname === "/") {
    return responseFromFile(Bun.file(WEB_DIST_INDEX));
  }

  const relativePath = sanitizeWebAssetPath(pathname);
  if (!relativePath) {
    return responseFromFile(Bun.file(WEB_DIST_INDEX));
  }

  const requestedFile = Bun.file(join(WEB_DIST_ROOT, relativePath));
  if (await requestedFile.exists()) {
    return responseFromFile(requestedFile);
  }

  if (!extname(pathname)) {
    return responseFromFile(Bun.file(WEB_DIST_INDEX));
  }

  return null;
};

export class AgentSurfaceTransport {
  constructor(public readonly runtime: RuntimeBootstrap) {}

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (
      request.method === "GET"
      && pathname !== "/healthz"
      && !pathname.startsWith("/api/")
    ) {
      const dashboardResponse = await serveBuiltWebDashboard(pathname);
      if (dashboardResponse) {
        return dashboardResponse;
      }
    }

    if (pathname === "/" && request.method === "GET") {
      return html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>CLOG Runtime</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        background: #0b1020;
        color: #eef2ff;
      }
      main {
        max-width: 760px;
        margin: 0 auto;
        padding: 56px 24px;
      }
      .eyebrow {
        color: #7dd3fc;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 12px;
        font-weight: 700;
      }
      h1 {
        margin: 12px 0 16px;
        font-size: 40px;
      }
      p {
        color: #cbd5e1;
        line-height: 1.6;
      }
      code, a {
        color: #93c5fd;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">CLOG</div>
      <h1>Runtime is up.</h1>
      <p>The launcher can open a browser target now, but the real web frontend is not built yet.</p>
      <p>Use the TUI for the actual interface, or hit <a href="/healthz"><code>/healthz</code></a> and <a href="/api/bootstrap"><code>/api/bootstrap</code></a> for runtime data.</p>
    </main>
  </body>
</html>`);
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

export const createWsManager = (): WebSocketManager => {
  return new WebSocketManager();
};
