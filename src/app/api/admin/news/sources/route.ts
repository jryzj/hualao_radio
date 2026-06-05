import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseOpml } from "@/lib/news/opml";
import { newsService } from "@/lib/news";
import dns from "dns/promises";
import net from "net";

// Reject URLs that would let the server reach internal resources
// (cloud metadata endpoints, RFC1918 hosts, loopback). This is
// SSRF protection for the manual URL add path; the OPML path is
// admin-only and feeds are public, so the same check is applied
// there too.
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

function ipIsBlocked(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts[0] === 10) return true;                         // 10.0.0.0/8
    if (parts[0] === 127) return true;                        // 127.0.0.0/8
    if (parts[0] === 169 && parts[1] === 254) return true;    // 169.254.0.0/16 link-local
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16/12
    if (parts[0] === 192 && parts[1] === 168) return true;   // 192.168/16
    if (parts[0] === 0) return true;                         // 0.0.0.0/8
    if (parts[0] >= 224) return true;                        // multicast + reserved
  } else if (net.isIPv6(ip)) {
    if (ip === "::1" || ip === "::") return true;            // loopback / unspecified
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // fc00::/7 ULA
    if (ip.startsWith("fe80")) return true;                  // fe80::/10 link-local
  }
  return false;
}

async function assertSafeHttpUrl(raw: string): Promise<{ ok: true; url: URL } | { ok: false; error: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "INVALID_URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "UNSUPPORTED_SCHEME" };
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) return { ok: false, error: "BLOCKED_HOST" };
  // If hostname is already an IP, validate it directly.
  if (net.isIP(host)) {
    if (ipIsBlocked(host)) return { ok: false, error: "BLOCKED_HOST" };
    return { ok: true, url };
  }
  // Resolve and check the actual IPs. This closes the DNS-rebind
  // window for the *initial* validation. The fetch itself is
  // best-effort — a future attacker who controls DNS at fetch
  // time would still get through, but the SSRF surface for "type
  // a URL into the admin form" is closed.
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    return { ok: false, error: "DNS_LOOKUP_FAILED" };
  }
  if (addrs.length === 0) return { ok: false, error: "DNS_LOOKUP_FAILED" };
  for (const a of addrs) {
    if (ipIsBlocked(a.address)) return { ok: false, error: "BLOCKED_HOST" };
  }
  return { ok: true, url };
}

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
    const safety = await assertSafeHttpUrl(body.url);
    if (!safety.ok) {
      return NextResponse.json(
        { error: safety.error, message: "URL rejected (private/internal host or invalid scheme)" },
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
