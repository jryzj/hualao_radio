import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { moderateMessage } from "@/lib/moderation";
import { liveEngine } from "@/lib/live-engine";
import { getMessageConfig } from "@/config";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { content, authorName } = body;

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: {
      content: content.trim(),
      authorName: typeof authorName === "string" && authorName.trim() ? authorName.trim() : "匿名用户",
      status: "pending",
    },
  });

  moderateMessage(message.content, message.authorName).then(async (result) => {
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

    const payload = updated.status === "approved"
      ? (updated.isVisible ? { type: "new_message", message: updated } : null)
      : updated.status === "rejected"
        ? { type: "message_rejected", id: updated.id }
        : null;
    if (payload) {
      try {
        const res = await fetch("http://localhost:8081/broadcast-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) console.error("[broadcast] non-ok response:", res.status);
      } catch (e) {
        console.error("[broadcast] fetch error:", e);
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