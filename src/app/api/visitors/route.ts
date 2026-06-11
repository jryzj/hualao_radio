import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rate-limit";
import { parseUA } from "@/lib/ua-parser";
import { readAdminCookie } from "@/lib/admin-auth";

// POST /api/visitors
//
// Records one visitor access. The client (homepage or admin layout)
// fires-and-forgets this on mount. We don't want a hung/missing
// network to block the page render, so:
//   - handler is small and returns quickly
//   - we accept the request with very permissive input — any field
//     can be missing; server-side parsing fills in the gaps from the
//     User-Agent header
//   - we never return a non-2xx unless something is fundamentally
//     broken (DB write failure), so a transient client error
//     doesn't produce scary console noise
//
// Per requirements: NO deduplication — every visit is its own row,
// including page reloads. (Cross-session dedup could be added later
// via a session cookie, but the current spec is one-row-per-visit.)
export async function POST(req: NextRequest) {
  try {
    // The client sends its navigator-derived hint so we can pick up
    // anything the User-Agent header misses (iPadOS-on-Mac trick,
    // model hints, etc.). Server-side parsing of the UA header is
    // still the source of truth — we treat client values as a
    // refinement, not a replacement.
    let body: {
      deviceType?: string;
      deviceModel?: string;
      deviceOs?: string;
      deviceName?: string;
      userName?: string;
      path?: string;
      userAgent?: string;
    } = {};
    try {
      body = await req.json();
    } catch {
      // No body is fine — we'll use only the server-derived values.
    }

    const ua = body.userAgent || req.headers.get("user-agent") || "";
    const parsed = parseUA(ua);

    // Client overrides win on a per-field basis when present and
    // non-empty. This lets the client contribute model hints the UA
    // string doesn't carry, while still letting the server be the
    // authoritative parser for OS / browser / device-type (the
    // fields where UA parsing is most reliable).
    const deviceType = (["mobile", "tablet", "desktop"] as const).includes(
      body.deviceType as "mobile" | "tablet" | "desktop",
    )
      ? (body.deviceType as "mobile" | "tablet" | "desktop")
      : parsed.deviceType;

    const deviceModel = (body.deviceModel && body.deviceModel.trim()) || parsed.deviceModel;
    const deviceOs = (body.deviceOs && body.deviceOs.trim()) || parsed.deviceOs;
    const deviceName = (body.deviceName && body.deviceName.trim()) || parsed.deviceName;
    const userName = (body.userName && body.userName.trim()) || parsed.userName;

    // path: only keep simple, relative paths so a misbehaving client
    // can't pollute the log with arbitrary strings.
    const path = (body.path || "/").startsWith("/")
      ? (body.path || "/").slice(0, 200)
      : "/";

    const ip = clientIp(req);
    const isAdmin = (await readAdminCookie()) !== null;

    await prisma.visitor.create({
      data: {
        ip,
        deviceType,
        deviceModel,
        deviceOs,
        deviceName,
        userName,
        isAdmin,
        path,
        userAgent: ua.slice(0, 500),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[visitors] POST failed:", err);
    // Don't propagate as 5xx — clients treat this as best-effort.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
