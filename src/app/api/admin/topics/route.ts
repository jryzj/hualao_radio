import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const themes = await prisma.theme.findMany({ include: { persona: true, workflow: true } });
  return NextResponse.json(themes);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const theme = await prisma.theme.create({
    data: {
      name: body.name,
      description: body.description ?? "",
      prompt: body.prompt ?? "",
      userPrompt: body.userPrompt ?? "请生成下一段直播内容。",
      audiencePrompt: body.audiencePrompt ?? "",
      historyRounds: typeof body.historyRounds === "number" ? body.historyRounds : 5,
      personaId: body.personaId,
      workflowId: body.workflowId,
    },
  });
  return NextResponse.json(theme);
}