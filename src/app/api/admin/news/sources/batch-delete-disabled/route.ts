import { NextResponse } from "next/server";
import { prisma, withBusyRetry } from "@/lib/prisma";

export async function DELETE() {
  const count = await prisma.rssSource.count({ where: { status: "disabled" } });
  if (count === 0) return NextResponse.json({ deleted: 0 });
  await withBusyRetry(() => prisma.rssSource.deleteMany({ where: { status: "disabled" } }));
  return NextResponse.json({ deleted: count });
}
