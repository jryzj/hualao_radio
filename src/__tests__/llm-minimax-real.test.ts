import { describe, it, expect } from "vitest";
import { streamChat } from "../lib/llm/minimax";
import { getLLMConfig } from "../config";

describe("Minimax LLM real API test", () => {
  it("streams response for '今天杭州的天气'", async () => {
    const config = await getLLMConfig();
    if (!config) {
      console.log("No LLM config found in DB, skipping real API test");
      return;
    }

    console.log("Using config:", { apiUrl: config.apiUrl, modelName: config.modelName });

    const messages = [{ role: "user" as const, content: "今天杭州的天气" }];
    const chunks: string[] = [];

    try {
      for await (const chunk of streamChat(config, messages)) {
        chunks.push(chunk);
        process.stdout.write(chunk); // Print chunks in real-time
      }
      console.log("\nTotal chunks:", chunks.length, "Total length:", chunks.join("").length);
      expect(chunks.length).toBeGreaterThan(0);
    } catch (err) {
      console.error("API error:", err);
      throw err;
    }
  });
});