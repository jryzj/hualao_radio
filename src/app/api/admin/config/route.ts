import { NextRequest, NextResponse } from "next/server";
import { getLLMConfig, getComfyUIConfig, getModerationPrompt, getAudioBufferConfig } from "@/config";

export async function GET() {
  const [llm, comfyui, moderationPrompt, audioBuffer] = await Promise.all([
    getLLMConfig(),
    getComfyUIConfig(),
    getModerationPrompt(),
    getAudioBufferConfig(),
  ]);
  return NextResponse.json({ llm, comfyui, moderationPrompt, audioBuffer });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  if (body.llm) await import("@/config").then(m => m.setLLMConfig(body.llm));
  if (body.comfyui) await import("@/config").then(m => m.setComfyUIConfig(body.comfyui));
  if (body.moderationPrompt !== undefined) await import("@/config").then(m => m.setModerationPrompt(body.moderationPrompt));
  if (body.audioBuffer) await import("@/config").then(m => m.setAudioBufferConfig(body.audioBuffer));
  return NextResponse.json({ success: true });
}