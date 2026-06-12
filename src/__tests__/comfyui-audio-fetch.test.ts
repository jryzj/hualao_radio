import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const TEST_OUTPUT_DIR = path.join(os.tmpdir(), "radioai-test-audio");

describe("ComfyUI TTS workflow encoding", () => {
  beforeAll(() => {
    if (!fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  it("workflow JSON correctly encodes Chinese text as UTF-8", () => {
    const workflowPath = path.join(process.cwd(), "my_omnivoice-tts_api.json");
    const raw = fs.readFileSync(workflowPath, "utf-8");
    const workflowJson = JSON.parse(raw);

    const node35 = workflowJson["35"] as Record<string, unknown>;
    const inputs = node35["inputs"] as Record<string, unknown>;
    inputs["text"] = "你好！";
    inputs["voice_instruct"] = "女，中音调";

    const prompt = { prompt: workflowJson };
    const serialized = JSON.stringify(prompt);

    // Verify Chinese characters are encoded as UTF-8 in the JSON string
    // "你好！" in UTF-8: e4bda0e5a5bdefbc81
    const textIndex = serialized.indexOf("你好");
    expect(textIndex).toBeGreaterThan(0);

    const textStart = textIndex;
    const textEnd = serialized.indexOf('"', textStart + 1);
    const chineseText = serialized.slice(textStart, textEnd);
    const chineseBytes = Buffer.from(chineseText, "utf8");

    // "你好！" = U+4F60 U+597D U+FF01
    // UTF-8: e4 bda0 e5 a5 bd ef bc 81
    expect(chineseBytes.toString("hex")).toBe("e4bda0e5a5bdefbc81");

    // Verify voice_instruct - find the value after "voice_instruct" key
    // The pattern is: "voice_instruct": "女，中音调"
    const voiceInstructKeyPos = serialized.indexOf('"voice_instruct"');
    const colonPos = serialized.indexOf(':', voiceInstructKeyPos);
    const openQuotePos = serialized.indexOf('"', colonPos + 1);
    const closeQuotePos = serialized.indexOf('"', openQuotePos + 1);
    const viText = serialized.slice(openQuotePos + 1, closeQuotePos);
    const viBytes = Buffer.from(viText, "utf8");

    // "女，中音调" Chinese bytes verification
    console.log("voice_instruct UTF-8 bytes:", viBytes.toString("hex"));
    console.log("voice_instruct value:", viText);
    expect(viText).toBe("女，中音调");
  });

  it("can serialize workflow and save to file", () => {
    const workflowPath = path.join(process.cwd(), "my_omnivoice-tts_api.json");
    const raw = fs.readFileSync(workflowPath, "utf-8");
    const workflowJson = JSON.parse(raw);

    const node35 = workflowJson["35"] as Record<string, unknown>;
    const inputs = node35["inputs"] as Record<string, unknown>;
    inputs["text"] = "你好！";
    inputs["voice_instruct"] = "女，中音调";

    const prompt = { prompt: workflowJson };
    const outputPath = path.join(TEST_OUTPUT_DIR, "test-workflow.json");
    fs.writeFileSync(outputPath, JSON.stringify(prompt, null, 2));

    expect(fs.existsSync(outputPath)).toBe(true);

    // Verify the saved file has correct encoding
    const saved = fs.readFileSync(outputPath, "utf-8");
    expect(saved.includes("你好")).toBe(true);
    expect(saved.includes("女，中音调")).toBe(true);
  });

  it("can save audio buffer locally", () => {
    const testFile = path.join(TEST_OUTPUT_DIR, "test-audio.wav");
    const fakeWavHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x24, 0x00, 0x00, 0x00, // file size - 8
      0x57, 0x41, 0x56, 0x45  // "WAVE"
    ]);
    fs.writeFileSync(testFile, fakeWavHeader);
    expect(fs.existsSync(testFile)).toBe(true);
    expect(fs.readFileSync(testFile).length).toBe(12);
  });
});