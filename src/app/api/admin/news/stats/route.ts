import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [total, active, disabled, itemCount, lastSource] = await Promise.all([
    prisma.rssSource.count(),
    prisma.rssSource.count({ where: { status: "active" } }),
    prisma.rssSource.count({ where: { status: "disabled" } }),
    prisma.rssItem.count(),
    prisma.rssSource.findFirst({ orderBy: { lastFetchedAt: "desc" } }),
  ]);
  return NextResponse.json({
    sourcesTotal: total,
    sourcesActive: active,
    sourcesDisabled: disabled,
    itemsTotal: itemCount,
    lastFetchedAt: lastSource?.lastFetchedAt ?? null,
  });
}
