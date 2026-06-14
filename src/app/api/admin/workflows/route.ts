import { NextRequest, NextResponse } from "next/server";
import { prisma, withBusyRetry } from "@/lib/prisma";

export async function GET() {
  const workflows = await prisma.workflow.findMany();
  return NextResponse.json(workflows);
}

// Same field whitelist used by the PUT route in
// src/app/api/admin/workflows/[id]/route.ts. POST previously passed
// the entire body through to Prisma, which let an admin (or a
// future XSS) overwrite refAudioPath to anything they wanted and
// break the public/uploads/ref-audio/<id>/ containment used by the
// ref-audio route. refAudioPath is intentionally NOT in this list —
// the only safe way to set it is via the dedicated upload endpoint,
// which performs its own path-containment check before writing.
const POST_FIELDS = ["name", "workflowJson", "inputParams", "refText", "instruct", "speed"] as const;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "body must be an object" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  for (const k of POST_FIELDS) {
    if (!(k in b)) continue;
    const v = b[k];
    if (k === "speed") {
      if (typeof v === "number" && Number.isFinite(v)) data.speed = v;
    } else if (k === "inputParams") {
      // inputParams is a JSON-encoded string in the DB; accept either
      // a string (passthrough) or an object/array (encode it).
      if (typeof v === "string") data.inputParams = v;
      else data.inputParams = JSON.stringify(v);
    } else {
      if (typeof v === "string") data[k] = v;
    }
  }
  data.name = b.name as string;
  if (data.workflowJson === undefined) data.workflowJson = "";
  if (data.inputParams === undefined) data.inputParams = "[]";
  if (data.speed === undefined) data.speed = 1.0;

  try {
    const workflow = await withBusyRetry(() => prisma.workflow.create({ data: data as never }));
    return NextResponse.json(workflow);
  } catch {
    // Logged server-side; don't echo raw Prisma errors to the client.
    console.error("[api/admin/workflows POST] error");
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}