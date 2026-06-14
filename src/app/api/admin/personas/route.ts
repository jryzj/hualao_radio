import { NextRequest, NextResponse } from "next/server";
import { prisma, withBusyRetry } from "@/lib/prisma";

export async function GET() {
  const personas = await prisma.persona.findMany();
  return NextResponse.json(personas);
}

export async function POST(req: NextRequest) {
  let body: { name?: unknown; prompt?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof body.prompt !== "string" || !body.prompt.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  // TypeScript control-flow narrowing is per-scope and doesn't carry
  // into a callback closure, so capture the narrowed strings as local
  // consts before handing them to withBusyRetry.
  const name = body.name.trim();
  const prompt = body.prompt;
  try {
    const persona = await withBusyRetry(() => prisma.persona.create({
      data: { name, prompt },
    }));
    return NextResponse.json(persona);
  } catch {
    console.error("[api/admin/personas POST] error");
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}