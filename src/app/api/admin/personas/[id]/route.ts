import { NextRequest, NextResponse } from "next/server";
import { prisma, withBusyRetry } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const persona = await withBusyRetry(() => prisma.persona.update({ where: { id }, data: body }));
  return NextResponse.json(persona);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await withBusyRetry(() => prisma.persona.delete({ where: { id } }));
  return NextResponse.json({ success: true });
}