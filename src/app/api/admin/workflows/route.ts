import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const workflows = await prisma.workflow.findMany();
  return NextResponse.json(workflows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const workflow = await prisma.workflow.create({
    data: {
      name: body.name,
      workflowJson: body.workflowJson ?? "",
      inputParams: JSON.stringify(body.inputParams ?? []),
      refAudioPath: body.refAudioPath ?? null,
      speed: body.speed ?? 1.0,
    },
  });
  return NextResponse.json(workflow);
}