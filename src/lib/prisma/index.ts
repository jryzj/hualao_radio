import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import "dotenv/config";

import path from "path";

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
let resolvedUrl = dbUrl;
if (dbUrl.startsWith("file:")) {
  const filePath = dbUrl.slice(5);
  resolvedUrl = `file:${path.resolve(process.cwd(), filePath)}`;
}

const adapter = new PrismaLibSql({ url: resolvedUrl });
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter } as any);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;