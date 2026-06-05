import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.type === "flush") {
      await fetch('http://localhost:8081/flush', { method: 'POST' });
      return NextResponse.json({ success: true });
    }
    const audioBuffer = Buffer.from(body.audio ?? "", "base64");
    if (audioBuffer.length > 0) {
      await fetch('http://localhost:8081/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: audioBuffer.toString('base64') }),
      });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
}