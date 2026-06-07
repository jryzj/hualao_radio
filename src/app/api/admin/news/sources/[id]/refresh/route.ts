import { NextRequest, NextResponse } from "next/server";
import { newsService } from "@/lib/news";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await newsService.refreshSource(id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "NOT_FOUND" ? 404 : 500 },
    );
  }
  return NextResponse.json({ ok: true, items: result.items });
}
