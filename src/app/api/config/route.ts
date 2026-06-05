import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const theme = await prisma.theme.findFirst({
    where: { isActive: true },
    include: { persona: true, workflow: true },
  });
  return NextResponse.json(theme);
}