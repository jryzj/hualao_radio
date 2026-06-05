import { NextRequest, NextResponse } from "next/server";
import { newsService } from "@/lib/news";

export async function POST(_req: NextRequest) {
  const result = await newsService.refreshAllSources();
  return NextResponse.json({ ok: true, ...result });
}
