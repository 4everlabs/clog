import type { RuntimeBootstrap } from "../bootstrap";
import { createRuntimeSurfaceHandler } from "./http-routes";

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
