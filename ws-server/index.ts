// tsx doesn't auto-load .env (Next does). This import makes the
// ws-server read the same .env the Next app reads, so WS_BROADCAST_TOKEN
// is the same on both sides. dotenv does not overwrite values already
// present in process.env, so shell exports still win.
import "dotenv/config";
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

// Replay buffer for late-joining audio clients. Each /broadcast chunk
// is pushed; the oldest is dropped when the array grows past
// `audioBufferMaxSize`. On a new /audio WS connect, the entire buffer
// is drained to the new client in order, then a {"type":"replay_end"}
// JSON marker is sent, then live broadcasts continue normally.
//
// The max size is driven by the same AudioBufferConfig.prebufferSentences
// the client uses to decide "buffer ready, start playing" — so a late
// joiner gets exactly enough to flip its own prebuffer check green and
// begin playback immediately. Refreshed by polling Next's
// /api/audio-buffer on startup + every 10s so admin changes propagate
// without a ws-server restart. In non-"sentences" modes the server
// still uses prebufferSentences as a chunk count; the client may need
// a few live chunks to fully satisfy its own (seconds/both) threshold,
// which is fine.
const audioBuffer: Buffer[] = [];
let audioBufferMaxSize = 3;
// Per-client "drain in progress" flag. /broadcast skips a client while
// this is true so a chunk pushed during drain isn't sent twice (once
// via /broadcast, once via the drain loop on the next iteration). The
// flag is set before the drain starts and cleared after, all in the
// same synchronous tick — Node's single-threaded event loop guarantees
// /broadcast can't observe a half-applied state.
const clientBuffering = new WeakMap<WebSocket, boolean>();

const NEXT_BASE = process.env.NEXT_BASE_URL ?? "http://127.0.0.1:3000";

async function refreshAudioBufferConfig(): Promise<void> {
  try {
    const res = await fetch(`${NEXT_BASE}/api/audio-buffer`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return;
    const cfg = await res.json();
    if (
      cfg &&
      typeof cfg.prebufferSentences === "number" &&
      cfg.prebufferSentences > 0
    ) {
      audioBufferMaxSize = Math.floor(cfg.prebufferSentences);
    }
  } catch {
    // Best-effort. Next may not be up at startup; the 10s poll will
    // pick it up. Never crash the WS server over a config refresh.
  }
}
refreshAudioBufferConfig();
const configPoll = setInterval(refreshAudioBufferConfig, 10_000);
configPoll.unref();

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
          if (client.readyState === WebSocket.OPEN && !clientBuffering.get(client)) {
            client.send(buffer);
          }
        }
        // Push to replay buffer and trim. Trim-on-push keeps the array
        // bounded regardless of how often /broadcast is hit.
        audioBuffer.push(buffer);
        while (audioBuffer.length > audioBufferMaxSize) audioBuffer.shift();
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
    // Flush = engine stop / theme change. Old audio has no meaning for
    // anyone connecting after this, so clear the replay buffer too.
    audioBuffer.length = 0;
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
  } else if (req.method === "GET" && req.url === "/stats") {
    // Live client counts for the admin dashboard. audioClients are
    // listeners on the /audio WS (people hearing the radio right now);
    // messageClients are browsers with the /messages WS open (the
    // homepage live-message feed, usually the same listeners, but
    // sometimes admin-only viewers of the message stream). The admin
    // page sums them; we just return the raw counts so the API is
    // self-explanatory and a future caller can decide differently.
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        audioClients: audioClients.size,
        messageClients: messageClients.size,
        online: audioClients.size + messageClients.size,
      }),
    );
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
  const remoteAddr = req.socket.remoteAddress ?? "?";
  const remotePort = req.socket.remotePort ?? "?";
  const connectedAt = Date.now();

  if (path === "/audio") {
    // Drain the replay buffer to the new client BEFORE adding it to
    // audioClients would be wrong: any /broadcast landing in between
    // drain and add would be missed. So we add first, then mark
    // "buffering" so the broadcast loop skips this client, then drain
    // (which may pick up chunks pushed by concurrent /broadcasts), then
    // emit the replay_end marker, then clear the flag. The flag flip
    // and the drain are all in this synchronous block, so /broadcast
    // can't observe a half-applied state.
    clientBuffering.set(ws, true);
    audioClients.add(ws);
    if (audioBuffer.length > 0) {
      console.log(`[WS] /audio client connected from ${remoteAddr}:${remotePort}, draining ${audioBuffer.length} chunks (max=${audioBufferMaxSize})`);
      for (const chunk of audioBuffer) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk, { binary: true });
        }
      }
    } else {
      console.log(`[WS] /audio client connected from ${remoteAddr}:${remotePort}, empty replay buffer (max=${audioBufferMaxSize})`);
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "replay_end" }));
    }
    clientBuffering.set(ws, false);
    ws.on("close", (code, reason) => {
      const durationMs = Date.now() - connectedAt;
      const reasonStr = reason?.toString() || "(empty)";
      console.log(
        `[WS] /audio client ${remoteAddr}:${remotePort} closed: ` +
        `code=${code} reason="${reasonStr}" durationMs=${durationMs} ` +
        `audioClients=${audioClients.size - 1}`,
      );
      audioClients.delete(ws);
      clientBuffering.delete(ws);
    });
    ws.on("error", (err) => {
      console.warn(`[WS] /audio client ${remoteAddr}:${remotePort} error:`, err.message);
    });
    // The audio path is server-push only. Clients are not allowed to
    // send binary frames back to the server for re-broadcast: any
    // client that does so is treated as a misuse. We deliberately do
    // not attach a `message` listener that re-broadcasts — the only
    // way audio reaches listeners is via the authenticated HTTP
    // /broadcast endpoint from the Next.js process.
  } else if (path === "/messages") {
    console.log(`[WS] /messages client connected from ${remoteAddr}:${remotePort}, total: ${messageClients.size + 1}`);
    messageClients.add(ws);
    ws.on("close", (code, reason) => {
      const durationMs = Date.now() - connectedAt;
      console.log(
        `[WS] /messages client ${remoteAddr}:${remotePort} closed: ` +
        `code=${code} reason="${reason?.toString() || "(empty)"}" ` +
        `durationMs=${durationMs} total: ${messageClients.size - 1}`,
      );
      messageClients.delete(ws);
    });
    ws.on("error", (err) => {
      console.warn(`[WS] /messages client ${remoteAddr}:${remotePort} error:`, err.message);
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
