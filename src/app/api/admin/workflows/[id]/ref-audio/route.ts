import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

const MAX_BYTES = 20 * 1024 * 1024; // 20MB

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const workflow = await prisma.workflow.findUnique({ where: { id } });
  if (!workflow) {
    return NextResponse.json({ error: "workflow not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file field is required" }, { status: 400 });
  }

  if (!file.type.startsWith("audio/")) {
    return NextResponse.json({ error: "file must be audio/*" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 20MB)" }, { status: 400 });
  }

  const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._一-龥-]/g, "_");
  const filename = `${Date.now()}-${safeName}`;
  const dirAbs = path.join(process.cwd(), "public", "uploads", "ref-audio", id);
  const fileAbs = path.join(dirAbs, filename);
  const relPath = path.posix.join("uploads", "ref-audio", id, filename);

  fs.mkdirSync(dirAbs, { recursive: true });

  // Delete old file if any
  if (workflow.refAudioPath) {
    const oldAbs = path.join(process.cwd(), "public", workflow.refAudioPath);
    try { if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs); } catch { /* ignore */ }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(fileAbs, buffer);

  await prisma.workflow.update({
    where: { id },
    data: { refAudioPath: relPath },
  });

  return NextResponse.json({ refAudioPath: relPath, url: `/uploads/ref-audio/${id}/${filename}` });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const workflow = await prisma.workflow.findUnique({ where: { id } });
  if (!workflow) {
    return NextResponse.json({ error: "workflow not found" }, { status: 404 });
  }

  if (workflow.refAudioPath) {
    const abs = path.join(process.cwd(), "public", workflow.refAudioPath);
    try { if (fs.existsSync(abs)) fs.unlinkSync(abs); } catch { /* ignore */ }
  }

  await prisma.workflow.update({
    where: { id },
    data: { refAudioPath: null },
  });

  return NextResponse.json({ success: true });
}
