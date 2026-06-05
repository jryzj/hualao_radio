import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const messages = await prisma.message.findMany({
    where: { status: "approved" },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(messages);
}