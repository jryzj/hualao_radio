-- Add Theme.prompt and Message.aiReason
-- These columns exist in schema.prisma but were never carried over into
-- a migration, so `prisma migrate deploy` left production tables missing them.
-- Both additions are backfilled with safe defaults: Theme.prompt is NOT NULL
-- with the empty string (matches schema default), Message.aiReason is nullable.

-- AlterTable
ALTER TABLE "Theme" ADD COLUMN "prompt" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "aiReason" TEXT;
