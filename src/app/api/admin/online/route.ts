import { NextResponse } from "next/server";
import { wsGetStats } from "@/lib/ws-server";

// GET /api/admin/online
//
// Returns the current WS client counts from the ws-server. The admin
// visitors page polls this every few seconds to show the "当前在线"
// badge. We re-use the same `wsGetStats` helper the rest of the app
// uses, so the auth path stays in one place.
//
// When the ws-server is unreachable (e.g. not started in dev) we
// return zeros rather than a 5xx — the admin page should still
// render. The page handles a 200 with all-zeros as "0 online",
// which is the same UX as "no data" from a user perspective.
export async function GET() {
  const stats = await wsGetStats();
  return NextResponse.json(
    stats ?? { audioClients: 0, messageClients: 0, online: 0 },
  );
}
