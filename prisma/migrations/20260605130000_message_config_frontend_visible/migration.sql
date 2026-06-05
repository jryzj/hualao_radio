-- Add frontendVisible toggle to MessageConfig.
-- Controls whether the message wall and message input are rendered on
-- the listener page. Default true preserves the prior behaviour.

-- AlterTable
ALTER TABLE "MessageConfig" ADD COLUMN "frontendVisible" BOOLEAN NOT NULL DEFAULT 1;
