import { NextRequest, NextResponse } from "next/server";
import {
  getLLMConfig,
  getComfyUIConfig,
  getModerationPrompt,
  getAudioBufferConfig,
  setLLMConfig,
  setComfyUIConfig,
  setModerationPrompt,
  setAudioBufferConfig,
} from "@/config";

// The LLM apiKey and ComfyUI bearer token are secrets. The GET response
// must never include the raw value: a leaked admin response (e.g. via
// a misconfigured log or a future CORS mistake) would have exposed
// them. The UI uses the "blank = keep existing" pattern on PUT.
function maskSecret(value: string | undefined | null): string {
  return value ? "<set>" : "";
}

export async function GET() {
  const [llm, comfyui, moderationPrompt, audioBuffer] = await Promise.all([
    getLLMConfig(),
    getComfyUIConfig(),
    getModerationPrompt(),
    getAudioBufferConfig(),
  ]);
  return NextResponse.json({
    llm: llm
      ? { apiUrl: llm.apiUrl, apiKey: maskSecret(llm.apiKey), modelName: llm.modelName }
      : null,
    comfyui: comfyui
      ? {
          serverUrl: comfyui.serverUrl,
          comfyuiToken: maskSecret(comfyui.comfyuiToken),
          webhookUrl: comfyui.webhookUrl,
          pollTimeoutMs: comfyui.pollTimeoutMs,
        }
      : null,
    moderationPrompt,
    audioBuffer,
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();

  if (body.llm) {
    // Empty apiKey means "don't change". Load existing and merge.
    const existing = (await getLLMConfig()) ?? { apiUrl: "", apiKey: "", modelName: "" };
    const next = {
      apiUrl: typeof body.llm.apiUrl === "string" ? body.llm.apiUrl : existing.apiUrl,
      apiKey:
        typeof body.llm.apiKey === "string" && body.llm.apiKey && body.llm.apiKey !== "<set>"
          ? body.llm.apiKey
          : existing.apiKey,
      modelName:
        typeof body.llm.modelName === "string" ? body.llm.modelName : existing.modelName,
    };
    await setLLMConfig(next);
  }

  if (body.comfyui) {
    const existing = (await getComfyUIConfig()) ?? {
      serverUrl: "",
      comfyuiToken: "",
      webhookUrl: "",
      pollTimeoutMs: 120000,
    };
    const next = {
      serverUrl:
        typeof body.comfyui.serverUrl === "string" ? body.comfyui.serverUrl : existing.serverUrl,
      comfyuiToken:
        typeof body.comfyui.comfyuiToken === "string" &&
        body.comfyui.comfyuiToken &&
        body.comfyui.comfyuiToken !== "<set>"
          ? body.comfyui.comfyuiToken
          : existing.comfyuiToken,
      webhookUrl:
        typeof body.comfyui.webhookUrl === "string" ? body.comfyui.webhookUrl : existing.webhookUrl,
      pollTimeoutMs:
        typeof body.comfyui.pollTimeoutMs === "number"
          ? body.comfyui.pollTimeoutMs
          : existing.pollTimeoutMs,
    };
    await setComfyUIConfig(next);
  }

  if (typeof body.moderationPrompt === "string") {
    await setModerationPrompt(body.moderationPrompt);
  }

  if (body.audioBuffer) {
    const existing = (await getAudioBufferConfig()) ?? {
      prebufferSentences: 3,
      prebufferSeconds: 8,
      prebufferMode: "sentences" as const,
      prebufferGroupSize: 3,
    };
    await setAudioBufferConfig({
      prebufferSentences:
        typeof body.audioBuffer.prebufferSentences === "number"
          ? body.audioBuffer.prebufferSentences
          : existing.prebufferSentences,
      prebufferSeconds:
        typeof body.audioBuffer.prebufferSeconds === "number"
          ? body.audioBuffer.prebufferSeconds
          : existing.prebufferSeconds,
      prebufferMode:
        typeof body.audioBuffer.prebufferMode === "string"
          ? (body.audioBuffer.prebufferMode as typeof existing.prebufferMode)
          : existing.prebufferMode,
      prebufferGroupSize:
        typeof body.audioBuffer.prebufferGroupSize === "number"
          ? body.audioBuffer.prebufferGroupSize
          : existing.prebufferGroupSize,
    });
  }

  return NextResponse.json({ success: true });
}