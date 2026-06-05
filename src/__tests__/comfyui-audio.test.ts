import { describe, it, expect, beforeAll } from "@jest/globals";
import fs from "fs";
import path from "path";
import os from "os";

const TEST_OUTPUT_DIR = path.join(os.tmpdir(), "radioai-test-audio");

describe("ComfyUI TTS workflow", () => {
  beforeAll(() => {
    if (!fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  it("injects Chinese text correctly into workflow JSON", () => {
    const workflowPath = path.join(process.cwd(), "my_omnivoice-tts_api.json");
    const raw = fs.readFileSync(workflowPath, "utf-8");
    const workflowJson = JSON.parse(raw);

    const node35 = workflowJson["35"] as Record<string, unknown>;
    const inputs = node35["inputs"] as Record<string, unknown>;
    inputs["text"] = "你好！";
    inputs["voice_instruct"] = "女，中音调";

    const prompt = { prompt: workflowJson };
    const serialized = JSON.stringify(prompt);

    const chineseIndex = serialized.indexOf("你好");
    expect(chineseIndex).toBeGreaterThan(0);

    // "你好！" = 3 chars, UTF-8: e4bda0 e5a5bd efbc81 (9 bytes)
    const textEnd = serialized.indexOf('"', chineseIndex + 1);
    const chineseBytes = Buffer.from(serialized.slice(chineseIndex, textEnd), "utf8");
    expect(chineseBytes.toString("hex")).toBe("e4bda0e5a5bdefbc81");
  });

  it("injects voice_instruct correctly", () => {
    const workflowPath = path.join(process.cwd(), "my_omnivoice-tts_api.json");
    const raw = fs.readFileSync(workflowPath, "utf-8");
    const workflowJson = JSON.parse(raw);

    const node35 = workflowJson["35"] as Record<string, unknown>;
    const inputs = node35["inputs"] as Record<string, unknown>;
    inputs["voice_instruct"] = "女，中音调";

    const prompt = { prompt: workflowJson };
    const serialized = JSON.stringify(prompt);

    const voiceIndex = serialized.indexOf("voice_instruct");
    const voiceInstructValue = serialized.slice(voiceIndex).match(/"女，中音调"/)?.[0];
    expect(voiceInstructValue).toBeDefined();
  });

  it("can save audio buffer to local file", () => {
    const testFile = path.join(TEST_OUTPUT_DIR, "test-audio.wav");
    const testBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);

    fs.writeFileSync(testFile, testBuffer);
    expect(fs.existsSync(testFile)).toBe(true);
    expect(fs.readFileSync(testFile).length).toBe(12);

    fs.unlinkSync(testFile);
  });

  it("workflow JSON produces valid ComfyUI prompt payload", () => {
    const workflowPath = path.join(process.cwd(), "my_omnivoice-tts_api.json");
    const raw = fs.readFileSync(workflowPath, "utf-8");
    const workflowJson = JSON.parse(raw);

    const node35 = workflowJson["35"] as Record<string, unknown>;
    const inputs = node35["inputs"] as Record<string, unknown>;
    inputs["text"] = "你好！";
    inputs["voice_instruct"] = "女，中音调";

    const prompt = { prompt: workflowJson };
    const str = JSON.stringify(prompt);
    const parsed = JSON.parse(str);

    expect(parsed.prompt["35"]["inputs"]["text"]).toBe("你好！");
    expect(parsed.prompt["35"]["inputs"]["voice_instruct"]).toBe("女，中音调");
  });

  it("check ComfyUI server connectivity", async () => {
    const response = await fetch("http://localhost:3000/api/admin/config");
    const config = await response.json();
    expect(config.comfyui).toBeDefined();
    expect(config.comfyui.serverUrl).toContain("ewfvvbvcwhxckz74ncc2c.830038.xyz");
  });
});