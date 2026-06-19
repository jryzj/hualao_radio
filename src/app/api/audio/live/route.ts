export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { error: "live audio stream disabled; use /audio WebSocket playback" },
    { status: 410 },
  );
}
