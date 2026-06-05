import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const AUDIO_FILE = "C:/Users/jryzj/AppData/Local/Temp/radioai-test-audio/found-audio.flac";

export async function GET() {
  try {
    if (!fs.existsSync(AUDIO_FILE)) {
      return NextResponse.json({ error: "Audio not found" }, { status: 404 });
    }
    const audioData = fs.readFileSync(AUDIO_FILE);
    return new NextResponse(audioData, {
      headers: {
        "Content-Type": "audio/flac",
        "Content-Length": audioData.length.toString(),
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to read audio" }, { status: 500 });
  }
}