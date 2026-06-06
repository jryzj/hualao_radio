// Client-side WebSocket base URL. The browser uses this for both
// /messages and /audio. The Next.js NEXT_PUBLIC_ prefix bakes the
// value into the client bundle at build time — set the env var
// before `npm run build` for production deploys.
//
// If unset, fall back to ws/wss on the page's hostname at port 8080,
// which matches the ws-server default and the dev workflow.

export function wsBaseUrl(): string {
  const fromEnv = (process.env as Record<string, string | undefined>).NEXT_PUBLIC_WS_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/+$/, "");
  if (typeof window === "undefined") return "ws://localhost:8080";
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.hostname}:8080`;
}
