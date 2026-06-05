import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { streamChat } from "../lib/llm/minimax";
import { getLLMConfig } from "../config";
import { submitOmniVoiceJob } from "../lib/comfyui";

vi.mock("../../ws-server/index", () => ({
  broadcastAudio: vi.fn((buffer: Buffer) => {
    console.log("[mock] broadcastAudio called, size:", buffer.length);
  }),
  broadcastAudioFlush: vi.fn(),
}));

const COMFYUI_SERVER = "https://ewfvvbvcwhxckz74ncc2c.830038.xyz";

async function getComfyUIToken(): Promise<string> {
  const res = await fetch("http://localhost:3000/api/admin/config");
  const config = await res.json() as { comfyui: { comfyuiToken: string } };
  return config.comfyui.comfyuiToken;
}

describe("Full flow: LLM → TTS → WebSocket broadcast", () => {
  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("LLM responds to '明天杭州的天气' and TTS generates audio", async () => {
    // Step 1: LLM generates response
    const llmConfig = await getLLMConfig();
    if (!llmConfig) {
      console.log("No LLM config found, skipping");
      return;
    }

    const messages = [{ role: "user" as const, content: "明天杭州的天气" }];
    const chunks: string[] = [];

    for await (const chunk of streamChat(llmConfig, messages)) {
      chunks.push(chunk);
      process.stdout.write(chunk);
    }

    const llmResponse = chunks.join("");
    console.log("\nLLM response length:", llmResponse.length);
    expect(llmResponse.length).toBeGreaterThan(0);

    // Step 2: Submit TTS job
    let comfyToken: string;
    try {
      comfyToken = await getComfyUIToken();
    } catch {
      console.log("Cannot get ComfyUI config, skipping TTS step");
      return;
    }

    const promptId = await submitOmniVoiceJob(llmResponse);
    console.log("TTS promptId:", promptId);
    expect(promptId).toBeDefined();

    // Step 3: Poll for completion and get audio
    let audioFetched = false;
    if (promptId) {
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const res = await fetch(`${COMFYUI_SERVER}/api/history/${promptId}`, {
            headers: { Authorization: `Bearer ${comfyToken}` },
          });
          if (!res.ok) {
            console.log(`Poll ${i + 1}: HTTP ${res.status}`);
            continue;
          }
          const text = await res.text();
          if (!text.trim()) {
            console.log(`Poll ${i + 1}: empty response`);
            continue;
          }
          const data = JSON.parse(text) as Record<string, unknown>;
          const entry = data[promptId] as Record<string, unknown> | undefined;
          if (!entry) {
            console.log(`Poll ${i + 1}: no entry yet`);
            continue;
          }
          const status = (entry.status as Record<string, unknown>).status_str as string;
          console.log(`Poll ${i + 1}: status=${status}`);
          if (status === "success") {
            const outputs = entry["outputs"] as Record<string, unknown> || {};
            const node2 = outputs["2"] as Record<string, unknown> | undefined;
            if (node2?.audio) {
              const audioArr = node2.audio as unknown[];
              if (audioArr?.length > 0) {
                const audioInfo = audioArr[0] as { filename: string; subfolder: string; type: string };
                console.log("Audio ready:", audioInfo.filename);
                audioFetched = true;
                break;
              }
            }
            break;
          }
        } catch (e) {
          console.log(`Poll ${i + 1} error:`, e);
        }
      }
    }

    expect(audioFetched).toBe(true);
  }, 180000);
});