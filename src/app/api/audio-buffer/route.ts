import { NextResponse } from "next/server";
import { getAudioBufferConfig } from "@/config";

export async function GET() {
  const cfg = await getAudioBufferConfig();
  return NextResponse.json(cfg);
}
