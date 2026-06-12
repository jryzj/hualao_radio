import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as any);

describe("Message CRUD via public API", () => {
  beforeAll(async () => {
    await prisma.message.deleteMany();
  });

  afterAll(async () => {
    await prisma.message.deleteMany();
    await prisma.$disconnect();
  });

  it("can submit a message with default author", async () => {
    const res = await fetch("http://localhost:3000/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "测试留言内容" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.content).toBe("测试留言内容");
    expect(body.authorName).toBe("匿名用户");
    expect(body.status).toBe("pending");
    expect(body.id).toBeDefined();
  });

  it("can submit a message with custom author name", async () => {
    const res = await fetch("http://localhost:3000/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "观众A的留言", authorName: "张三" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.authorName).toBe("张三");
  });

  it("can retrieve approved messages via live endpoint", async () => {
    await prisma.message.updateMany({ where: { status: "pending" }, data: { status: "approved" } });

    const res = await fetch("http://localhost:3000/api/messages/live");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.every((m: { status: string }) => m.status === "approved")).toBe(true);
  });
});