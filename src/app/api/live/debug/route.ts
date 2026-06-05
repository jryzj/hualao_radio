import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLLMConfig } from "@/config";

export async function GET() {
  const theme = await prisma.theme.findFirst({ where: { isActive: true }, include: { persona: true } });
  const config = await getLLMConfig();
  return NextResponse.json({
    theme: theme ? { name: theme.name, isActive: theme.isActive } : null,
    llmConfigured: !!config,
    timestamp: new Date().toISOString(),
  });
}