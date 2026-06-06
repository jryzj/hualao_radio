// Shared path-containment helper for anything that reads or writes
// files under public/uploads/. The DB column `Workflow.refAudioPath`
// was once writable from a raw PUT body, so a tampered value could
// have stored e.g. "../../.env". The whitelist on the workflow PUT
// blocks new writes, but legacy values may still exist — every read
// (upload, delete, AND serve) must run through the same containment
// check so the two sides can't drift.

import path from "path";

export const PUBLIC_ROOT = path.resolve(process.cwd(), "public");

export function resolveUnderPublic(rel: string): string | null {
  if (!rel || rel.includes("\0")) return null;
  const abs = path.resolve(PUBLIC_ROOT, rel);
  if (!abs.startsWith(PUBLIC_ROOT + path.sep) && abs !== PUBLIC_ROOT) return null;
  return abs;
}
