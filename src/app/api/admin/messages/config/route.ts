import { NextRequest, NextResponse } from "next/server";
import { getMessageConfig, setMessageConfig } from "@/config";

export async function GET() {
  const cfg = await getMessageConfig();
  return NextResponse.json(cfg);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const next = Math.max(
    1,
    Math.min(500, Math.floor(Number(body.maxVisibleMessages) || 50)),
  );
  const frontendVisible =
    typeof body.frontendVisible === "boolean" ? body.frontendVisible : true;
  // Scroll speed clamp: 5s (very fast, still readable) … 600s (10 min,
  // basically a static wall). 80s is the previous hardcoded value.
  const scrollSpeedSeconds = Math.max(
    5,
    Math.min(600, Math.floor(Number(body.scrollSpeedSeconds) || 80)),
  );
  await setMessageConfig({ maxVisibleMessages: next, frontendVisible, scrollSpeedSeconds });
  return NextResponse.json({ ok: true, maxVisibleMessages: next, frontendVisible, scrollSpeedSeconds });
}
