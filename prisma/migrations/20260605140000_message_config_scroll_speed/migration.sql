-- AlterTable
-- Add scrollSpeedSeconds to MessageConfig. Existing rows receive the
-- default 80, matching the previous hardcoded value in the frontend, so
-- no visible behaviour change for already-deployed configs.
ALTER TABLE "MessageConfig" ADD COLUMN "scrollSpeedSeconds" INTEGER NOT NULL DEFAULT 80;
