import { NextRequest, NextResponse } from "next/server";
import { submitOmniVoiceJob } from "@/lib/comfyui";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text?.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    const promptId = await submitOmniVoiceJob(text.trim());
    if (!promptId) {
      return NextResponse.json({ error: "failed to submit job" }, { status: 500 });
    }
    return NextResponse.json({ promptId, status: "submitted" });
  } catch (err) {
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}