import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  try {
    const persona = await prisma.persona.create({
      data: { name: body.name.trim(), prompt: body.prompt },
    });
    return NextResponse.json(persona);
  } catch {
    console.error("[api/admin/personas POST] error");
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}