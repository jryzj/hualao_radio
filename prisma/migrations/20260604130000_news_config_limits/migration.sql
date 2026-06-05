-- Add configurable news context limits to NewsConfig
ALTER TABLE "NewsConfig" ADD COLUMN "maxNewsItems" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "NewsConfig" ADD COLUMN "maxItemChars" INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE "NewsConfig" ADD COLUMN "maxTotalChars" INTEGER NOT NULL DEFAULT 5000;
