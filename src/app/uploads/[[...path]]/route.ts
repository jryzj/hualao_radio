// Catches /uploads/* at the App Router layer. Built-in static
// serving of `public/` snapshots the directory at build time, so any
// file written by the upload API after `next build` (i.e. every
// production upload) 404s. This route reads the file at request
// time and serves it. In dev the same files were served by the
// built-in static layer; this just makes the post-build case work
// the same way.
//
// Security: every request goes through resolveUnderPublic so a
// crafted /uploads/../../etc/passwd can't escape public/.
//
// Known limitation: full-file in-memory read with no Range support.
// Ref-audio is small (<5MB typical) and low-traffic, and the
// <audio> element seeks locally once it has the bytes, so Range
// is not required for the listener page to work. Switch to
// fs.createReadStream + a Range parser if/when this assumption
// breaks.

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { resolveUnderPublic } from "@/lib/upload-path";

const AUDIO_MIME: Record<string, string> = {
  ".wav":  "audio/wav",
  ".mp3":  "audio/mpeg",
  ".flac": "audio/flac",
  ".m4a":  "audio/mp4",
  ".aac":  "audio/aac",
  ".ogg":  "audio/ogg",
  ".oga":  "audio/ogg",
  ".opus": "audio/ogg",
  ".webm": "audio/webm",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const segs = (await params).path;
  if (!segs || segs.length === 0) {
    return new NextResponse("not found", { status: 404 });
  }
  const rel = path.posix.join(...segs);
  const abs = resolveUnderPublic(rel);
  if (!abs) {
    return new NextResponse("forbidden", { status: 403 });
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return new NextResponse("not found", { status: 404 });
  }
  const buf = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  const ct = AUDIO_MIME[ext] ?? "application/octet-stream";
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "Content-Length": String(buf.length),
    },
  });
}
