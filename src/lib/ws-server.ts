// Authenticated HTTP client for the ws-server's broadcast endpoints.
// The token is read from WS_BROADCAST_TOKEN; if it's missing, the
// helper throws so callers can fail fast at boot rather than silently
// failing to broadcast.
//
// BROADCAST_BASE precedence:
//   1. WS_BROADCAST_BASE_URL — full URL override, use this for
//      non-loopback hosts (e.g. when Next and ws-server are on
//      different machines in a multi-host deploy).
//   2. WS_HTTP_PORT (default 8081) — keeps Next in sync with the
//      ws-server's port if you only set the port. Loopback-only,
//      since the ws-server binds to 127.0.0.1.
const BROADCAST_BASE =
  process.env.WS_BROADCAST_BASE_URL ?? `http://127.0.0.1:${process.env.WS_HTTP_PORT ?? 8081}`;

function token(): string {
  const t = process.env.WS_BROADCAST_TOKEN;
  if (!t) {
    throw new Error(
      "WS_BROADCAST_TOKEN is not set. The ws-server HTTP broadcast API requires a shared secret.",
    );
  }
  return t;
}

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token()}`,
  };
}

export async function wsBroadcast(audioBase64: string): Promise<void> {
  const res = await fetch(`${BROADCAST_BASE}/broadcast`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ audio: audioBase64 }),
  });
  if (!res.ok) {
    console.error("[ws-server] /broadcast non-ok:", res.status);
  }
}

export async function wsFlush(): Promise<void> {
  const res = await fetch(`${BROADCAST_BASE}/flush`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    console.error("[ws-server] /flush non-ok:", res.status);
  }
}

export async function wsBroadcastMessage(
  payload:
    | { type: "new_message"; message: Record<string, unknown> }
    | { type: "message_rejected"; id: string }
    | { type: "message_hidden"; id: string },
): Promise<void> {
  const res = await fetch(`${BROADCAST_BASE}/broadcast-message`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error("[ws-server] /broadcast-message non-ok:", res.status);
  }
}
