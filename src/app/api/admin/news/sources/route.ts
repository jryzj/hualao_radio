import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseOpml } from "@/lib/news/opml";
import { newsService } from "@/lib/news";

export async function GET() {
  const sources = await prisma.rssSource.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { items: true } } },
  });
  return NextResponse.json(sources);
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  // OPML upload via multipart/form-data
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "INVALID_XML", message: "No file uploaded under 'file' field" },
        { status: 400 },
      );
    }
    const xml = await file.text();
    const result = parseOpml(xml);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, message: result.message },
        { status: 400 },
      );
    }
    let created = 0;
    let updated = 0;
    for (const feed of result.feeds) {
      const existing = await prisma.rssSource.findUnique({ where: { url: feed.xmlUrl } });
      if (existing) {
        await prisma.rssSource.update({
          where: { url: feed.xmlUrl },
          data: {
            title: feed.title || existing.title,
            text: feed.text || existing.text,
            type: feed.type || existing.type,
            htmlUrl: feed.htmlUrl || existing.htmlUrl,
            description: feed.description || existing.description,
            language: feed.language || existing.language,
            status: "active",
            failCount: 0,
          },
        });
        updated++;
      } else {
        await prisma.rssSource.create({
          data: {
            url: feed.xmlUrl,
            title: feed.title,
            text: feed.text,
            type: feed.type,
            htmlUrl: feed.htmlUrl,
            description: feed.description,
            language: feed.language,
          },
        });
        created++;
      }
    }
    // Trigger immediate first fetch (fire and forget)
    newsService.refreshAllSources().catch((err) =>
      console.error("[admin/news/sources] initial refresh failed:", err),
    );
    return NextResponse.json({ ok: true, created, updated, total: result.feeds.length });
  }

  // JSON body: manual URL add
  if (contentType.includes("application/json")) {
    const body = await req.json();
    if (!body.url || typeof body.url !== "string") {
      return NextResponse.json(
        { error: "INVALID_URL", message: "Field 'url' is required" },
        { status: 400 },
      );
    }
    const existing = await prisma.rssSource.findUnique({ where: { url: body.url } });
    if (existing) {
      return NextResponse.json(
        { error: "DUPLICATE", message: "Source with this URL already exists", id: existing.id },
        { status: 409 },
      );
    }
    const created = await prisma.rssSource.create({
      data: {
        url: body.url,
        title: body.title ?? "",
        type: body.type ?? "",
        htmlUrl: body.htmlUrl ?? "",
        description: body.description ?? "",
        language: body.language ?? "",
      },
    });
    return NextResponse.json({ ok: true, id: created.id });
  }

  return NextResponse.json(
    { error: "UNSUPPORTED", message: "Use multipart/form-data or application/json" },
    { status: 415 },
  );
}
