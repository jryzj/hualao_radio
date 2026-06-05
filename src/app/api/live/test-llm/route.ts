import { NextResponse } from "next/server";
import { getLLMConfig } from "@/config";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const theme = await prisma.theme.findFirst({ where: { isActive: true }, include: { persona: true } });
  const config = await getLLMConfig();

  if (!theme || !config) {
    return NextResponse.json({ error: "missing theme or config", theme: !!theme, config: !!config });
  }

  const systemPrompt = theme.prompt
    ? theme.prompt.replace(/\{\{name\}\}/g, theme.persona.name).replace(/\{\{prompt\}\}/g, theme.persona.prompt).replace(/\{\{theme\.name\}\}/g, theme.name).replace(/\{\{theme\.description\}\}/g, theme.description)
    : `你是${theme.persona.name}，一个${theme.persona.prompt}。当前直播主题：${theme.name}。${theme.description}。请根据以上信息自主发挥，生成一段直播内容（约100-200字）。`;

  console.log("[test-llm] systemPrompt:", systemPrompt);

  let llmOk = false;
  let llmError = "";
  let llmResponse = "";

  try {
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.modelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "请生成一段直播内容（约50字）。" },
        ],
        max_completion_tokens: 200,
      }),
    });
    const data = await response.json();
    llmResponse = data.choices?.[0]?.message?.content ?? "(empty)";
    llmOk = true;
    console.log("[test-llm] LLM response:", llmResponse);
  } catch (err) {
    llmError = String(err);
    console.error("[test-llm] LLM error:", llmError);
  }

  return NextResponse.json({ llmOk, llmError, llmResponse, themeName: theme.name, personaName: theme.persona.name });
}