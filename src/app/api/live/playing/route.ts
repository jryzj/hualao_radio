import { NextRequest, NextResponse } from "next/server";
import { liveEngine } from "@/lib/live-engine";

// POST /api/live/playing
//
// The browser posts here whenever its isPlaying state flips, so the
// engine can decide whether to (re)start audio generation. The
// engine runs only when (online > 0) AND (playingClients.size > 0),
// and per-client tracking is the only way to keep one listener's
// STOP from pausing the engine for everyone.
//
// Body: { playing: boolean, clientId: string }   (both required;
// clientId is the per-browser UUID minted in src/app/page.tsx and
// stored in localStorage).
//
// Returns 400 if clientId is missing or empty — the engine can't
// know which client is reporting and would silently drop the call,
// so we surface the regression to the browser console instead.
//
// Called from src/app/page.tsx at the three isPlaying-flip sites
// (startPlayback, stopPlayback, onAudioEnded). Reachable to anyone
// via the /api/live/* proxy in proxy.ts (it's in PUBLIC_LIVE_PATHS).
export async function POST(req: NextRequest) {
  let playing = true;
  let clientId: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.playing === "boolean") playing = body.playing;
    if (typeof body?.clientId === "string" && body.clientId.length > 0) {
      clientId = body.clientId;
    }
  } catch {
    // No body / non-JSON body: treat as missing both fields.
  }
  if (!clientId) {
    // Reject loudly so a regression (e.g. someone deletes the
    // getOrCreateClientId() helper) is visible in the browser
    // console. We don't 5xx because this is a publicly-reachable
    // path; 400 is the right code for "you sent bad input".
    return NextResponse.json(
      { ok: false, reason: "missing clientId" },
      { status: 400 },
    );
  }
  liveEngine.reportClientPlaying(playing, clientId);
  return NextResponse.json({ ok: true, playing });
}
