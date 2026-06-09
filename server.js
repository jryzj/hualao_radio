const http = require("http");
const net = require("net");
const { spawn } = require("child_process");
const next = require("next");

const PORT = Number(process.env.PORT || 3000);
const WS_PORT = Number(process.env.WS_PORT || 8080);
const WS_TARGET_PORT = Number(process.env.WS_TARGET_PORT || WS_PORT);
const IS_DEV = process.argv.includes("--dev");

process.on("uncaughtException", (err) => {
  if (err.code === "EPIPE" || err.code === "ECONNRESET" || err.message?.includes("WebSocket frame")) {
    return;
  }
  console.error("[server] Uncaught exception:", err);
  process.exit(1);
});

function startWsServer() {
  const child = spawn("npx", ["tsx", "ws-server/index.ts"], {
    stdio: "inherit",
    env: { ...process.env, WS_PORT: String(WS_PORT) },
    shell: true,
  });
  child.on("exit", (code) => {
    if (code !== 0) console.error(`[server] ws-server exited with code ${code}`);
  });
  const kill = () => child.kill();
  process.on("exit", kill);
  process.on("SIGINT", kill);
  process.on("SIGTERM", kill);
}

const app = next({ dev: IS_DEV });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  if (IS_DEV) startWsServer();

  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  server.on("upgrade", (req, clientSocket, head) => {
    const targetSocket = net.connect(WS_TARGET_PORT, "127.0.0.1", () => {
      const method = req.method || "GET";
      const host = req.headers["host"] || `127.0.0.1:${WS_TARGET_PORT}`;
      targetSocket.write(
        `${method} ${req.url} HTTP/${req.httpVersion || "1.1"}\r\n` +
        Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") +
        "\r\n\r\n"
      );
      if (head && head.length > 0) targetSocket.write(head);
      clientSocket.pipe(targetSocket);
      targetSocket.pipe(clientSocket);
    });
    targetSocket.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => targetSocket.destroy());
  });

  server.listen(PORT, () => {
    console.log(`[server] RadioAI on :${PORT}${IS_DEV ? " (dev+Turbopack)" : ""}, WS proxy (TCP tunnel) → 127.0.0.1:${WS_TARGET_PORT}`);
  });
});
