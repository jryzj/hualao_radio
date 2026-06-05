import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import "dotenv/config";

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
// NOTE: We pass the URL through to libsql unchanged. libsql accepts
// `file:relative` and resolves it against the process cwd at connection
// time, so we don't need a `path.resolve(process.cwd(), ...)` here.
// Avoiding that call at module load also keeps Turbopack's file
// tracer from grabbing the whole project tree.
const adapter = new PrismaLibSql({ url: dbUrl });
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter } as any);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;