import { NextResponse } from "next/server";
import { getMessageConfig } from "@/config";

// Public read-only view of the message-wall config. The listener page
// polls this on a 15s interval + on visibility/focus so admin runtime
// changes (max visible, scroll speed, frontend visibility toggle)
// propagate to listeners without a manual reload.
//
// The corresponding write endpoint is PUT /api/admin/messages/config
// — mutations are admin-only. Splitting read/write like this keeps the
// listener page from having to authenticate just to learn how many
// messages to render, and keeps any future secret-bearing fields out
// of the public response shape by construction.
export async function GET() {
  const cfg = await getMessageConfig();
  return NextResponse.json(cfg);
}
