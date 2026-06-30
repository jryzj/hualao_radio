import { NextRequest, NextResponse } from "next/server";
import { prisma, withBusyRetry } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const key of ["name", "description", "prompt", "userPrompt", "audiencePrompt", "personaId", "workflowId"]) {
    if (key in body) data[key] = body[key];
  }
  if ("historyRounds" in body) data.historyRounds = body.historyRounds;
  if ("isActive" in body) data.isActive = body.isActive;
  const theme = await withBusyRetry(() => {
    if (data.isActive === true) {
      return prisma.$transaction(async (tx) => {
        await tx.theme.updateMany({
          where: { id: { not: id }, isActive: true },
          data: { isActive: false },
        });
        return tx.theme.update({ where: { id }, data });
      });
    }
    return prisma.theme.update({ where: { id }, data });
  });
  return NextResponse.json(theme);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await withBusyRetry(() => prisma.theme.delete({ where: { id } }));
  return NextResponse.json({ success: true });
}
