import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const personas = await prisma.persona.findMany();
  return NextResponse.json(personas);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const persona = await prisma.persona.create({ data: { name: body.name, prompt: body.prompt } });
  return NextResponse.json(persona);
}