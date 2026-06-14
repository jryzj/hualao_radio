import { NextRequest, NextResponse } from "next/server";
import { prisma, withBusyRetry } from "@/lib/prisma";

// Only these fields may be updated via PUT. Whitelisting (rather than
// passing the request body straight through) blocks the call from
// mutating `id`, `createdAt`, or any relation fields a future caller
// might sneak in.
const ALLOWED_FIELDS = ["name", "personality"] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];

type Editable = {
  name?: string;
  personality?: string;
};

function pickFields(body: unknown): Editable {
  if (!body || typeof body !== "object") return {};
  const out: Editable = {};
  for (const k of ALLOWED_FIELDS) {
    if (k in (body as Record<string, unknown>)) {
      const v = (body as Record<string, unknown>)[k];
      if (typeof v === "string" && v.trim()) {
        out[k] = k === "name" ? v.trim() : v;
      }
    }
  }
  return out;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const data = pickFields(body);
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no editable fields provided" }, { status: 400 });
  }
  try {
    const persona = await withBusyRetry(() => prisma.persona.update({ where: { id }, data }));
    return NextResponse.json(persona);
  } catch {
    // Logged server-side; don't echo raw Prisma errors to the client.
    console.error("[api/admin/personas PUT] error");
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await withBusyRetry(() => prisma.persona.delete({ where: { id } }));
  return NextResponse.json({ success: true });
}
