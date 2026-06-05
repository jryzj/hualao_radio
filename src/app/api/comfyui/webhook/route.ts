import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ComfyUI posts to this endpoint when an audio job completes. The
// request is authenticated with an HMAC of the body keyed by
// COMFYUI_WEBHOOK_SECRET. If the env var is not set, the endpoint
// refuses to process the request — the broadcast relay must never
// be open to the world.
function checkHmac(req: NextRequest, body: string): boolean {
  const secret = process.env.COMFYUI_WEBHOOK_SECRET;
  if (!secret) return false;
  const got = req.headers.get("x-comfyui-signature");
  if (!got) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  if (got.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.COMFYUI_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }
  const raw = await req.text();
  if (!checkHmac(req, raw)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { type?: string; audio?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  if (body.type === "flush") {
    await import("@/lib/ws-server").then(m => m.wsFlush());
    return NextResponse.json({ success: true });
  }
  const audioBuffer = Buffer.from(body.audio ?? "", "base64");
  if (audioBuffer.length > 0) {
    await import("@/lib/ws-server").then(m => m.wsBroadcast(audioBuffer.toString("base64")));
  }
  return NextResponse.json({ success: true });
}