import { NextRequest, NextResponse } from "next/server";
import { streamChat } from "@/lib/llm/minimax";
import { getLLMConfig } from "@/config";
import { submitOmniVoiceJob } from "@/lib/comfyui";
import { prisma } from "@/lib/prisma";

const PUNCTUATION = /[。？！.!?]/;

function createSSEEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, systemPrompt } = body as { prompt?: string; systemPrompt?: string };

  if (!prompt?.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const config = await getLLMConfig();
  if (!config) {
    return NextResponse.json({ error: "LLM config not found" }, { status: 500 });
  }

  const theme = await prisma.theme.findFirst({ where: { isActive: true }, include: { persona: true } });
  const defaultSystemPrompt = systemPrompt
    || (theme ? `你是${theme.persona.name}，一个${theme.persona.prompt}。` : "你是一个友好的AI助手。");

  const encoder = new TextEncoder();
  let sentenceBuffer = "";
  let sentenceCount = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(createSSEEvent(event, data)));
      };

      try {
        sendEvent("status", { message: "开始生成回复..." });

        const messages = [
          { role: "system" as const, content: defaultSystemPrompt },
          { role: "user" as const, content: prompt },
        ];

        let lastSentence = "";

        for await (const chunk of streamChat(config, messages)) {
          sentenceBuffer += chunk;

          // Send the incremental text to client
          sendEvent("text_chunk", { text: chunk });

          // Check for sentence completion
          const match = sentenceBuffer.match(PUNCTUATION);
          if (match) {
            const sentences = sentenceBuffer.split(PUNCTUATION);
            // All sentences except the last (incomplete) one are complete
            for (let i = 0; i < sentences.length - 1; i++) {
              const sentence = sentences[i].trim();
              if (!sentence) continue;

              sentenceCount++;
              sendEvent("sentence_complete", {
                index: sentenceCount,
                text: sentence,
                isLast: false,
              });

              // Send to TTS
              console.log(`[chat-stream] TTS request #${sentenceCount}:`, sentence.substring(0, 30));
              const p = submitOmniVoiceJob(sentence);
              console.log(`[chat-stream] TTS promptId:`, (await p) || "submitted");
            }
            // Keep the last part (incomplete sentence) in buffer
            sentenceBuffer = sentences[sentences.length - 1];
          }
        }

        // Send remaining text in buffer as the last sentence
        if (sentenceBuffer.trim()) {
          sentenceCount++;
          sendEvent("sentence_complete", {
            index: sentenceCount,
            text: sentenceBuffer.trim(),
            isLast: true,
          });

          console.log(`[chat-stream] Final TTS request #${sentenceCount}:`, sentenceBuffer.trim().substring(0, 30));
          const p = submitOmniVoiceJob(sentenceBuffer.trim());
          console.log(`[chat-stream] Final TTS promptId:`, (await p) || "submitted");
        }

        sendEvent("done", { totalSentences: sentenceCount });
        controller.close();
      } catch (err) {
        console.error("[chat-stream] Stream error:", err);
        sendEvent("error", { message: String(err) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}