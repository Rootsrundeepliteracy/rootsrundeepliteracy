import { DurableObject } from "cloudflare:workers";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }

      const rawRoom = url.searchParams.get("room") || "";
      const room = rawRoom.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);

      if (!room) {
        return new Response("Missing room code", { status: 400 });
      }

      const stub = env.ROOMS.getByName(room);
      return stub.fetch(request);
    }

    return new Response("RootRoom Live sync server is running.", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "access-control-allow-origin": "*"
      }
    });
  }
};

export class RootRoomRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    const board = (await this.ctx.storage.get("board")) || [];
    server.send(JSON.stringify({ type: "state", board }));

    this.broadcastPresence();

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async webSocketMessage(ws, message) {
    try {
      const data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));

      if (data.type === "state" && Array.isArray(data.board)) {
        const board = data.board.slice(0, 300).map(item => ({
          id: String(item.id || "").slice(0, 80),
          text: String(item.text || "").slice(0, 20),
          type: String(item.type || "consonant").slice(0, 20),
          left: Number(item.left) || 0,
          top: Number(item.top) || 0
        }));

        await this.ctx.storage.put("board", board);

        const payload = JSON.stringify({
          type: "state",
          board
        });

        for (const socket of this.ctx.getWebSockets()) {
          if (socket !== ws) {
            try { socket.send(payload); } catch {}
          }
        }
      }

      if (data.type === "clear") {
        await this.ctx.storage.put("board", []);
        const payload = JSON.stringify({ type: "state", board: [] });

        for (const socket of this.ctx.getWebSockets()) {
          try { socket.send(payload); } catch {}
        }
      }
    } catch {
      // Ignore malformed messages.
    }
  }

  webSocketClose(ws, code, reason, wasClean) {
    try { ws.close(code, reason); } catch {}
    this.broadcastPresence();
  }

  webSocketError(ws) {
    try { ws.close(1011, "WebSocket error"); } catch {}
    this.broadcastPresence();
  }

  broadcastPresence() {
    const sockets = this.ctx.getWebSockets();
    const payload = JSON.stringify({
      type: "presence",
      count: sockets.length
    });

    for (const socket of sockets) {
      try { socket.send(payload); } catch {}
    }
  }
}
