import { DurableObject } from "cloudflare:workers";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8" }
  });
}

function cleanRoom(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);

    if (url.pathname === "/health") return json({ ok: true, service: "RootRoom Live v2" });

    if (url.pathname === "/state") {
      const room = cleanRoom(url.searchParams.get("room"));
      if (!room) return json({ ok: false, error: "Missing room code" }, 400);
      const stub = env.ROOMS.getByName(room);

      if (request.method === "GET") {
        try {
          const state = await stub.getState();
          return json({ ok: true, ...state });
        } catch (error) {
          return json({ ok: false, error: String(error?.message || error) }, 500);
        }
      }

      if (request.method === "POST") {
        let payload;
        try { payload = await request.json(); }
        catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
        if (!Array.isArray(payload?.board)) return json({ ok: false, error: "Board must be an array" }, 400);
        try {
          const state = await stub.setState(payload.board);
          return json({ ok: true, ...state });
        } catch (error) {
          return json({ ok: false, error: String(error?.message || error) }, 500);
        }
      }

      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    return new Response("RootRoom Live v2 sync server is running.", {
      headers: { ...CORS, "content-type": "text/plain; charset=utf-8" }
    });
  }
};

export class RootRoomSession extends DurableObject {
  async getState() {
    return (await this.ctx.storage.get("state")) || { board: [], rev: 0 };
  }

  async setState(board) {
    const safeBoard = board.slice(0, 300).map(item => ({
      id: String(item?.id || "").slice(0, 80),
      text: String(item?.text || "").slice(0, 20),
      type: String(item?.type || "consonant").slice(0, 20),
      left: Number(item?.left) || 0,
      top: Number(item?.top) || 0
    }));
    const current = (await this.ctx.storage.get("state")) || { board: [], rev: 0 };
    const next = { board: safeBoard, rev: Number(current.rev || 0) + 1 };
    await this.ctx.storage.put("state", next);
    return next;
  }
}
