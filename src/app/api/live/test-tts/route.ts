import { NextResponse } from "next/server";
import { submitOmniVoiceJob } from "@/lib/comfyui";

export async function GET() {
  const text = "测试音频生成，这是一个简单的测试句子。";
  console.log("[test-tts] sending text:", text);
  const result = await submitOmniVoiceJob(text);
  return NextResponse.json({ result, text });
}