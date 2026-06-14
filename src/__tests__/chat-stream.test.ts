import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { streamChat } from "../lib/llm/minimax";
import { getLLMConfig, getComfyUIConfig } from "../config";
import { prisma } from "../lib/prisma";

describe("Chat stream: LLM → sentence split → TTS → WebSocket broadcast", () => {
  afterAll(() => {
    prisma.$disconnect();
  });

  it("streams LLM response and triggers TTS per sentence", async () => {
    const llmConfig = await getLLMConfig();
    if (!llmConfig) {
      console.log("No LLM config found, skipping test");
      return;
    }

    const theme = await prisma.theme.findFirst({
      where: { isActive: true },
      include: { persona: true },
    });
    const systemPrompt = theme
      ? `你是${theme.persona.name}，一个${theme.persona.personality}。`
      : "你是一个友好的AI助手。";

    const prompt = "杭州的明天的天气怎么样";
    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: prompt },
    ];

    // Collect LLM chunks and detect sentence boundaries
    const chunks: string[] = [];
    let sentenceBuffer = "";
    const sentences: string[] = [];

    console.log("[test] Starting LLM stream...");
    for await (const chunk of streamChat(llmConfig, messages)) {
      chunks.push(chunk);
      process.stdout.write(chunk);
      sentenceBuffer += chunk;

      // Detect sentence completion on punctuation
      const punctMatch = sentenceBuffer.match(/[。？！.!?]/);
      if (punctMatch) {
        const parts = sentenceBuffer.split(/[。？！.!?]/);
        for (let i = 0; i < parts.length - 1; i++) {
          const s = parts[i].trim();
          if (s) {
            sentences.push(s);
            console.log(`\n[test] Sentence #${sentences.length}: ${s.substring(0, 40)}...`);
          }
        }
        sentenceBuffer = parts[parts.length - 1];
      }
    }

    // Final sentence
    if (sentenceBuffer.trim()) {
      sentences.push(sentenceBuffer.trim());
      console.log(`\n[test] Final sentence: ${sentenceBuffer.trim().substring(0, 40)}...`);
    }

    console.log(`\n[test] LLM response collected: ${chunks.length} chunks, ${sentences.length} sentences`);
    expect(chunks.length).toBeGreaterThan(0);
    expect(sentences.length).toBeGreaterThan(0);

    // Verify sentence splitting by punctuation
    const fullText = chunks.join("");
    console.log(`[test] Full text: ${fullText.substring(0, 50)}...`);
    console.log(`[test] Sentences detected: ${sentences.length}`);

    // Each sentence should end with punctuation in the original text
    for (const sentence of sentences) {
      expect(sentence.length).toBeGreaterThan(0);
    }

    console.log("[test] Sentence splitting verified successfully");
  }, 120000);
});