import { NextResponse } from "next/server";
import { liveEngine } from "@/lib/live-engine";

export async function POST() {
  liveEngine.onPlaybackComplete();
  return NextResponse.json({ ok: true });
}