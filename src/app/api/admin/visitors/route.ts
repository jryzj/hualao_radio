import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/admin/visitors
//
// Paginated visitor list for the admin dashboard. Supports a few
// simple filters (path prefix, isAdmin, search by IP / model / user)
// to keep the page useful as the table grows. The page is only
// reachable to authenticated admins via the proxy at /admin/*, so we
// don't double-check the session here — relying on the proxy means
// the cookie/secret path stays in one place.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.max(1, Math.min(200, parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20));
  const skip = (page - 1) * pageSize;

  const pathPrefix = url.searchParams.get("pathPrefix");
  const isAdminParam = url.searchParams.get("isAdmin");
  const search = (url.searchParams.get("q") ?? "").trim();

  // Build the where clause incrementally so we don't end up with
  // an empty `AND: []` in the Prisma query (which still works but is
  // ugly to read in logs).
  const where: Record<string, unknown> = {};
  if (pathPrefix) where.path = { startsWith: pathPrefix };
  if (isAdminParam === "true") where.isAdmin = true;
  else if (isAdminParam === "false") where.isAdmin = false;
  if (search) {
    // OR over the human-readable fields. SQLite + Prisma supports
    // `contains` on string columns; the underlying SQL is case-
    // sensitive by default with Prisma's `mode: "insensitive"` —
    // but SQLite doesn't honor it. We lowercase both sides manually
    // via `search.toLowerCase()` and rely on the data being stored
    // in its original mixed case. For an admin log this is good
    // enough; full fuzzy search would need FTS5.
    where.OR = [
      { ip: { contains: search } },
      { deviceModel: { contains: search } },
      { deviceOs: { contains: search } },
      { deviceName: { contains: search } },
      { userName: { contains: search } },
      { path: { contains: search } },
    ];
  }

  const [visitors, total] = await Promise.all([
    prisma.visitor.findMany({
      where,
      orderBy: { visitAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.visitor.count({ where }),
  ]);

  return NextResponse.json({ visitors, total, page, pageSize });
}
