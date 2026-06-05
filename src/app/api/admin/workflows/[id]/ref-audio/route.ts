import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

const MAX_BYTES = 20 * 1024 * 1024; // 20MB

// Browsers are inconsistent about what MIME they report for audio
// formats. Chrome 91+ sends `audio/flac` for .flac, but Firefox and
// older Chrome report `application/octet-stream`. We trust the
// extension as a fallback — anything audio-shaped under public/ is
// fair game as long as it isn't an obviously dangerous double-dot
// name (caught by `cleanName` below).
const AUDIO_EXTS = new Set([".wav", ".mp3", ".flac", ".m4a", ".ogg", ".oga", ".opus", ".webm", ".aac"]);

// Both POST (delete-old-then-write-new) and DELETE touch files
// relative to the public/ root using a path that ultimately comes
// from a DB column. The DB column used to be settable from a raw
// PUT body, which let an attacker store e.g. "../../.env". Even
// though the workflow PUT is now whitelisted, the value may have
// been written before the fix landed, so we still resolve and
// check containment on every read.
const PUBLIC_ROOT = path.resolve(process.cwd(), "public");

function resolveUnderPublic(rel: string): string | null {
  // Reject NUL bytes, backslashes (we're on POSIX-style paths in
  // the DB even on Windows since path.posix.join is used), and
  // anything that doesn't normalize to a descendant of PUBLIC_ROOT.
  if (!rel || rel.includes("\0")) return null;
  const abs = path.resolve(PUBLIC_ROOT, rel);
  if (!abs.startsWith(PUBLIC_ROOT + path.sep) && abs !== PUBLIC_ROOT) return null;
  return abs;
}

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

  if (!file.type.startsWith("audio/") && !AUDIO_EXTS.has(path.extname(file.name).toLowerCase())) {
    return NextResponse.json({ error: "file must be an audio file" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 20MB)" }, { status: 400 });
  }

  const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._一-龥-]/g, "_");
  // Strip leading dots so we can't end up with `..hidden`.
  const cleanName = safeName.replace(/^\.+/, "");
  const filename = `${Date.now()}-${cleanName}`;
  const dirAbs = path.join(PUBLIC_ROOT, "uploads", "ref-audio", id);
  const fileAbs = path.join(dirAbs, filename);
  const relPath = path.posix.join("uploads", "ref-audio", id, filename);

  fs.mkdirSync(dirAbs, { recursive: true });

  // Delete old file if any — guarded by the containment check so
  // a tampered DB value can't trick us into unlinking arbitrary
  // files.
  if (workflow.refAudioPath) {
    const oldAbs = resolveUnderPublic(workflow.refAudioPath);
    if (oldAbs) {
      try { if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs); } catch { /* ignore */ }
    }
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
    const abs = resolveUnderPublic(workflow.refAudioPath);
    if (abs) {
      try { if (fs.existsSync(abs)) fs.unlinkSync(abs); } catch { /* ignore */ }
    }
  }

  await prisma.workflow.update({
    where: { id },
    data: { refAudioPath: null },
  });

  return NextResponse.json({ success: true });
}
