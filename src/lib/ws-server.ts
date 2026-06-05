// Authenticated HTTP client for the ws-server's broadcast endpoints.
// The token is read from WS_BROADCAST_TOKEN; if it's missing, the
// helper throws so callers can fail fast at boot rather than silently
// failing to broadcast.
const BROADCAST_BASE = process.env.WS_BROADCAST_BASE_URL ?? "http://127.0.0.1:8081";

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
