import { NextResponse } from "next/server";
import { liveEngine } from "@/lib/live-engine";

export async function POST() {
  console.log("[stop route] stopping engine");
  liveEngine.stop();
  return NextResponse.json({ running: false });
}