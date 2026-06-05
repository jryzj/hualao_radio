import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const source = await prisma.rssSource.findUnique({ where: { id } });
  if (!source) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));

  const items = await prisma.rssItem.findMany({
    where: { sourceId: id },
    orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      title: true,
      link: true,
      publishedAt: true,
      fetchedAt: true,
      description: true,
      contentMd: true,
    },
  });

  return NextResponse.json({
    source: {
      id: source.id,
      url: source.url,
      title: source.title,
      text: source.text,
      status: source.status,
      failCount: source.failCount,
      lastFetchedAt: source.lastFetchedAt,
    },
    items,
    total: items.length,
  });
}
