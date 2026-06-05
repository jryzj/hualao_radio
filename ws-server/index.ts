import { WebSocketServer, WebSocket } from "ws";
import http from "http";

const PORT = Number(process.env.WS_PORT ?? 8080);
const HTTP_PORT = Number(process.env.WS_HTTP_PORT ?? 8081);

// Shared secret for the HTTP broadcast endpoints. Required for the
// server to start — if it isn't set we refuse to bind the HTTP port
// so an accidentally-public deployment can't be hijacked.
const BROADCAST_TOKEN = process.env.WS_BROADCAST_TOKEN;
if (!BROADCAST_TOKEN) {
  console.error(
    "[WS Server] WS_BROADCAST_TOKEN is not set. Refusing to start the HTTP broadcast API.",
  );
  // We still start the WS side so listeners on :8080 can connect, but
  // the HTTP broadcast functions will all return 503.
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function checkToken(req: http.IncomingMessage): boolean {
  if (!BROADCAST_TOKEN) return false;
  const header = req.headers["authorization"] ?? "";
  const got = header.toString().startsWith("Bearer ")
    ? header.toString().slice(7)
    : (req.headers["x-broadcast-token"] as string | undefined);
  if (!got) return false;
  return timingSafeEqual(got, BROADCAST_TOKEN);
}

// Cap the size of an HTTP body to 16 MB — broadcast audio chunks
// are far smaller (a few hundred KB at most), and anything bigger is
// almost certainly abuse.
const MAX_BODY_BYTES = 16 * 1024 * 1024;

const wss = new WebSocketServer({
  port: PORT,
  // Refuse oversized frames at the protocol level so a misbehaving
  // client can't OOM the server by spamming huge messages.
  maxPayload: 4 * 1024 * 1024,
});
const audioClients = new Set<WebSocket>();
const messageClients = new Set<WebSocket>();

// HTTP server for internal broadcast commands. Bound to loopback only
// so external hosts can't reach it (defense in depth — the token check
// below is the primary control).
const httpServer = http.createServer((req, res) => {
  if (!BROADCAST_TOKEN) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "broadcast token not configured" }));
    return;
  }
  if (!checkToken(req)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  if (req.method === "POST" && req.url === "/broadcast") {
    let body = "";
    let size = 0;
    let aborted = false;
    req.on("data", chunk => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "payload too large" }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      if (aborted) return;
      try {
        const { audio } = JSON.parse(body);
        const buffer = Buffer.from(audio, "base64");
        console.log(`[HTTP] broadcast request, ${audioClients.size} clients, ${buffer.length} bytes`);
        for (const client of audioClients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(buffer);
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, clients: audioClients.size }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid" }));
      }
    });
  } else if (req.method === "POST" && req.url === "/flush") {
    console.log(`[HTTP] flush request, ${audioClients.size} clients`);
    for (const client of audioClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "flush" }));
      }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } else if (req.method === "POST" && req.url === "/broadcast-message") {
    let body = "";
    let size = 0;
    let aborted = false;
    req.on("data", chunk => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "payload too large" }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      if (aborted) return;
      try {
        const p = JSON.parse(body);
        if (p.type === "new_message" && p.message) {
          console.log(`[HTTP] broadcast-message new_message, ${messageClients.size} clients`);
          broadcastNewMessage(p.message);
        } else if (p.type === "message_rejected" && typeof p.id === "string") {
          console.log(`[HTTP] broadcast-message message_rejected, ${messageClients.size} clients`);
          broadcastMessageRejected(p.id);
        } else if (p.type === "message_hidden" && typeof p.id === "string") {
          console.log(`[HTTP] broadcast-message message_hidden, ${messageClients.size} clients`);
          broadcastMessageHidden(p.id);
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "bad payload" }));
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid" }));
      }
    });
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  }
});

// Loopback only. The HTTP API is meant to be hit by the Next.js
// server on the same host; binding to 0.0.0.0 would expose the
// broadcast relay to anyone on the LAN.
httpServer.listen(HTTP_PORT, "127.0.0.1", () => {
  console.log(
    `[WS Server] WebSocket on ws://localhost:${PORT}, HTTP broadcast on http://127.0.0.1:${HTTP_PORT} (token required)`,
  );
});

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path === "/audio") {
    audioClients.add(ws);
    ws.on("close", () => audioClients.delete(ws));
    // The audio path is server-push only. Clients are not allowed to
    // send binary frames back to the server for re-broadcast: any
    // client that does so is treated as a misuse. We deliberately do
    // not attach a `message` listener that re-broadcasts — the only
    // way audio reaches listeners is via the authenticated HTTP
    // /broadcast endpoint from the Next.js process.
  } else if (path === "/messages") {
    console.log(`[WS] /messages client connected, total: ${messageClients.size + 1}`);
    messageClients.add(ws);
    ws.on("close", () => {
      console.log(`[WS] /messages client disconnected, total: ${messageClients.size - 1}`);
      messageClients.delete(ws);
    });
  } else {
    ws.close();
  }
});

export function broadcastAudio(buffer: Buffer) {
  console.log(`[broadcastAudio] called, ${audioClients.size} clients, sending ${buffer.length} bytes`);
  for (const client of audioClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(buffer, { binary: true });
    }
  }
}

export function broadcastAudioFlush() {
  const msg = JSON.stringify({ type: "flush" });
  for (const client of audioClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

export function broadcastNewMessage(message: Record<string, unknown>) {
  const msg = JSON.stringify({ type: "new_message", message });
  for (const client of messageClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

export function broadcastMessageRejected(id: string) {
  const msg = JSON.stringify({ type: "message_rejected", id });
  for (const client of messageClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

export function broadcastMessageHidden(id: string) {
  const msg = JSON.stringify({ type: "message_hidden", id });
  for (const client of messageClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

console.log(`[WS Server] Listening on ws://localhost:${PORT}`);
