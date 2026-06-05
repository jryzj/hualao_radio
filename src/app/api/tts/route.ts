import { NextRequest, NextResponse } from "next/server";
import { submitOmniVoiceJob } from "@/lib/comfyui";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const MAX_TEXT_LEN = 2000;

export async function POST(req: NextRequest) {
  const rl = rateLimit(`tts:${clientIp(req)}`, { limit: 5, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
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