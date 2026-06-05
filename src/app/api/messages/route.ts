import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { moderateMessage } from "@/lib/moderation";
import { liveEngine } from "@/lib/live-engine";
import { getMessageConfig } from "@/config";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const MAX_CONTENT_LEN = 500;
const MAX_AUTHOR_LEN = 32;

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = rateLimit(`messages:${ip}`, { limit: 3, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", resetAt: rl.resetAt },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  let body: { content?: unknown; authorName?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { content, authorName } = body;

  if (typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  if (content.length > MAX_CONTENT_LEN) {
    return NextResponse.json(
      { error: `content too long (max ${MAX_CONTENT_LEN} chars)` },
      { status: 400 },
    );
  }
  const author =
    typeof authorName === "string" && authorName.trim()
      ? authorName.trim().slice(0, MAX_AUTHOR_LEN)
      : "匿名用户";

  // Strip template markers that would otherwise land verbatim in
  // the LLM prompt and let a listener steer the broadcast.
  const sanitizedContent = content
    .trim()
    .slice(0, MAX_CONTENT_LEN)
    .replace(/[{}]/g, "");

  const message = await prisma.message.create({
    data: {
      content: sanitizedContent,
      authorName: author,
      status: "pending",
    },
  });

  moderateMessage(message.content, message.authorName).then(async (result: { status: "approved" | "rejected" | "pending"; reason?: string }) => {
    let updated;
    try {
      updated = await prisma.message.update({
        where: { id: message.id, status: "pending" },
        data: {
          status: result.status,
          reviewedAt: new Date(),
          aiReason: result.reason,
        },
      });
    } catch {
      return; // admin already acted — drop AI result
    }

    if (updated.status === "approved") {
      await liveEngine.injectMessage(updated.id);
    }

    const payload: Parameters<typeof import("@/lib/ws-server").wsBroadcastMessage>[0] | null =
      updated.status === "approved"
        ? updated.isVisible
          ? { type: "new_message", message: updated as unknown as Record<string, unknown> }
          : null
        : updated.status === "rejected"
          ? { type: "message_rejected", id: updated.id }
          : null;
    if (payload) {
      try {
        await import("@/lib/ws-server").then(m => m.wsBroadcastMessage(payload));
      } catch (e) {
        console.error("[broadcast] error:", e);
      }
    }
  });

  return NextResponse.json(message, { status: 201 });
}

export async function GET() {
  const cfg = await getMessageConfig();
  const messages = await prisma.message.findMany({
    where: { status: "approved", isVisible: true },
    orderBy: { createdAt: "desc" },
    take: cfg.maxVisibleMessages,
  });
  // Return in chronological order so the wall scrolls naturally.
  return NextResponse.json(messages.reverse());
}