import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const existing = await prisma.rssSource.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const newStatus = existing.status === "active" ? "disabled" : "active";
  const updated = await prisma.rssSource.update({
    where: { id },
    data: {
      status: newStatus,
      failCount: newStatus === "active" ? 0 : existing.failCount,
    },
  });
  return NextResponse.json({ ok: true, status: updated.status });
}
