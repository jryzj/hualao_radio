-- AlterTable
ALTER TABLE "Theme" ADD COLUMN "userPrompt" TEXT NOT NULL DEFAULT '请生成下一段直播内容。';
ALTER TABLE "Theme" ADD COLUMN "historyRounds" INTEGER NOT NULL DEFAULT 5;
