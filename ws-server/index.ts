import { WebSocketServer, WebSocket } from "ws";
import http from "http";

const PORT = Number(process.env.WS_PORT ?? 8080);
const HTTP_PORT = Number(process.env.WS_HTTP_PORT ?? 8081);

const wss = new WebSocketServer({ port: PORT });
const audioClients = new Set<WebSocket>();
const messageClients = new Set<WebSocket>();

// HTTP server for internal broadcast commands
const httpServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/broadcast") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
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
        res.writeHead(400);
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
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
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
          res.writeHead(400);
          return res.end(JSON.stringify({ error: "bad payload" }));
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "invalid" }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`[WS Server] WebSocket on ws://localhost:${PORT}, HTTP broadcast on http://localhost:${HTTP_PORT}`);
});

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path === "/audio") {
    audioClients.add(ws);
    ws.on("close", () => audioClients.delete(ws));
    ws.on("message", (data) => {
      console.log(`[WS] Audio received from client, size: ${(data as Buffer).length}`);
      // Broadcast to ALL audio clients including sender
      for (const client of audioClients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      }
    });
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