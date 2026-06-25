import { NextRequest, NextResponse } from "next/server";
import { submitOmniVoiceJob } from "@/lib/comfyui";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { wsGetStats } from "@/lib/ws-server";

const MAX_TEXT_LEN = 2000;

export async function POST(req: NextRequest) {
  const rl = rateLimit(`tts:${clientIp(req)}`, { limit: 5, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Pre-flight: don't burn ComfyUI cycles for nobody. The LiveEngine
  // gates its own LLM/TTS pipeline via pauseCheck(), but this
  // endpoint is a back-door that bypasses the engine entirely.
  // Short-circuit when there are no audio listeners so external
  // callers (curl, scripts, the dev test page) don't trigger empty
  // TTS jobs. Without this guard, the engine's own pause logic
  // wouldn't catch this path because we go straight to ComfyUI
  // without writing to playingClients.
  try {
    const stats = await wsGetStats();
    if (!stats || stats.audioClients === 0) {
      return NextResponse.json({ error: "no listeners" }, { status: 503 });
    }
  } catch {
    // ws-server unreachable — fall through and let the TTS job run
    // rather than blocking all traffic on a stats lookup. The
    // rate-limit above still applies.
  }

  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  const text = body.text.trim().slice(0, MAX_TEXT_LEN);
  try {
    const promptId = await submitOmniVoiceJob(text);
    if (!promptId) {
      return NextResponse.json({ error: "failed to submit job" }, { status: 500 });
    }
    return NextResponse.json({ promptId, status: "submitted" });
  } catch {
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}