import { NextRequest, NextResponse } from "next/server";
import { prisma, withBusyRetry } from "@/lib/prisma";
import { liveEngine } from "@/lib/live-engine";

async function broadcast(payload: object) {
  try {
    await import("@/lib/ws-server").then(m =>
      m.wsBroadcastMessage(payload as Parameters<typeof m.wsBroadcastMessage>[0]),
    );
  } catch (e) {
    console.error("[broadcast] error:", e);
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.max(1, Math.min(200, parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20));
  const skip = (page - 1) * pageSize;

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.message.count(),
  ]);
  return NextResponse.json({ messages, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action === "review") {
    if (!body.id || (body.status !== "approved" && body.status !== "rejected" && body.status !== "pending")) {
      return NextResponse.json({ error: "invalid review payload" }, { status: 400 });
    }
    const prev = await prisma.message.findUnique({ where: { id: body.id } });
    if (!prev) return NextResponse.json({ error: "not found" }, { status: 404 });

    const updated = await withBusyRetry(() => prisma.message.update({
      where: { id: body.id },
      data: { status: body.status, reviewedAt: new Date() },
    }));

    if (prev.status !== "approved" && updated.status === "approved") {
      await liveEngine.injectMessage(updated.id);
    }

    const wasOnWall = prev.status === "approved" && prev.isVisible;
    const isOnWall = updated.status === "approved" && updated.isVisible;
    if (!wasOnWall && isOnWall) {
      await broadcast({ type: "new_message", message: updated });
    } else if (wasOnWall && !isOnWall) {
      await broadcast({ type: "message_hidden", id: updated.id });
    }
    if (updated.status === "rejected" && prev.status !== "rejected") {
      await broadcast({ type: "message_rejected", id: updated.id });
    }
    return NextResponse.json(updated);
  }

  if (body.action === "setVisible") {
    if (!body.id || typeof body.visible !== "boolean") {
      return NextResponse.json({ error: "invalid setVisible payload" }, { status: 400 });
    }
    const prev = await prisma.message.findUnique({ where: { id: body.id } });
    if (!prev) return NextResponse.json({ error: "not found" }, { status: 404 });

    const updated = await withBusyRetry(() => prisma.message.update({
      where: { id: body.id },
      data: { isVisible: body.visible },
    }));

    const wasOnWall = prev.status === "approved" && prev.isVisible;
    const isOnWall = updated.status === "approved" && updated.isVisible;
    if (!wasOnWall && isOnWall) {
      await broadcast({ type: "new_message", message: updated });
    } else if (wasOnWall && !isOnWall) {
      await broadcast({ type: "message_hidden", id: updated.id });
    }
    return NextResponse.json(updated);
  }

  if (body.action === "delete") {
    if (!body.id) {
      return NextResponse.json({ error: "invalid delete payload" }, { status: 400 });
    }
    const prev = await prisma.message.findUnique({ where: { id: body.id } });
    if (!prev) return NextResponse.json({ error: "not found" }, { status: 404 });

    const wasOnWall = prev.status === "approved" && prev.isVisible;
    await withBusyRetry(() => prisma.message.delete({ where: { id: body.id } }));

    if (wasOnWall) {
      await broadcast({ type: "message_hidden", id: body.id });
    }
    return NextResponse.json({ ok: true, id: body.id });
  }

  const message = await withBusyRetry(() => prisma.message.create({
    data: { content: body.content, authorName: body.authorName ?? "匿名用户" },
  }));
  return NextResponse.json(message);
}
