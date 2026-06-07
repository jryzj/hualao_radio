import { NextRequest, NextResponse } from "next/server";
import { prisma, withBusyRetry } from "@/lib/prisma";

// Only these fields may be updated via PUT. A wider allowlist (e.g.
// forwarding the raw body) would let an unauthenticated caller (or
// a future XSS) overwrite `refAudioPath` and escape the
// `public/uploads/ref-audio/<id>/` containment used by the
// ref-audio route.
const ALLOWED_FIELDS = ["name", "workflowJson", "inputParams", "refText", "speed"] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];

type Editable = {
  name?: string;
  workflowJson?: string;
  inputParams?: string;
  refText?: string;
  speed?: number;
};

function pickFields(body: unknown): Editable {
  if (!body || typeof body !== "object") return {};
  const out: Editable = {};
  for (const k of ALLOWED_FIELDS) {
    if (k in (body as Record<string, unknown>)) {
      const v = (body as Record<string, unknown>)[k];
      if (k === "speed") {
        if (typeof v === "number" && Number.isFinite(v)) out.speed = v;
      } else {
        if (typeof v === "string") out[k] = v;
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
    const workflow = await withBusyRetry(() => prisma.workflow.update({ where: { id }, data }));
    return NextResponse.json(workflow);
  } catch {
    // Logged server-side; don't echo raw Prisma errors to the client
    // (they can include field names and constraint info).
    console.error("[api/admin/workflows PUT] error");
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await withBusyRetry(() => prisma.workflow.delete({ where: { id } }));
  return NextResponse.json({ success: true });
}