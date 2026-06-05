import { NextResponse } from "next/server";
import { liveEngine } from "@/lib/live-engine";

export async function GET() {
  return NextResponse.json({ running: liveEngine.isRunning() });
}