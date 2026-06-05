import { NextResponse } from "next/server";
import { liveEngine } from "@/lib/live-engine";

export async function POST() {
  liveEngine.start({});
  return NextResponse.json({ running: true });
}