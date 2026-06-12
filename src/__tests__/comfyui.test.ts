import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("ComfyUI OmniVoice workflow injection", () => {
  const workflowPath = path.join(process.cwd(), "my_omnivoice-tts_api.json");

  function injectText(text: string, voiceInstruct = "female, neutral, clear", speed = 1.0) {
    const raw = fs.readFileSync(workflowPath, "utf-8");
    const workflowJson = JSON.parse(raw);
    const node35 = workflowJson["35"] as Record<string, unknown>;
    const inputs = node35["inputs"] as Record<string, unknown>;
    inputs["text"] = text;
    inputs["voice_instruct"] = voiceInstruct;
    inputs["speed"] = speed;
    return workflowJson;
  }

  it("injects text into node 35 inputs", () => {
    const result = injectText("你好");
    const node35 = result["35"] as Record<string, unknown>;
    const inputs = node35["inputs"] as Record<string, unknown>;
    expect(inputs["text"]).toBe("你好");
  });

  it("injects voice_instruct into node 35 inputs", () => {
    const result = injectText("你好", "male, deep voice, american accent");
    const node35 = result["35"] as Record<string, unknown>;
    const inputs = node35["inputs"] as Record<string, unknown>;
    expect(inputs["voice_instruct"]).toBe("male, deep voice, american accent");
  });

  it("injects speed into node 35 inputs", () => {
    const result = injectText("你好", "female, neutral, clear", 1.5);
    const node35 = result["35"] as Record<string, unknown>;
    const inputs = node35["inputs"] as Record<string, unknown>;
    expect(inputs["speed"]).toBe(1.5);
  });

  it("keeps other node 35 input fields intact", () => {
    const result = injectText("你好");
    const node35 = result["35"] as Record<string, unknown>;
    const inputs = node35["inputs"] as Record<string, unknown>;
    expect(inputs["model"]).toBe("OmniVoice-bf16");
    expect(inputs["steps"]).toBe(32);
    expect(inputs["guidance_scale"]).toBe(2);
  });

  it("produces valid ComfyUI prompt payload", () => {
    const result = injectText("你好");
    const prompt = { prompt: result };
    const str = JSON.stringify(prompt);
    const parsed = JSON.parse(str);
    expect(parsed.prompt["35"]["inputs"]["text"]).toBe("你好");
  });
});