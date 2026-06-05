-- Change NewsConfig.activeWindowMs default from 4h to 1d.
-- Affects both A-path (idle, random RSS) and C-path (listener FTS5 search):
-- the "active window" now means "articles published in the last 24h".

-- AlterTable
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NewsConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prefetchIntervalMs" INTEGER NOT NULL DEFAULT 300000,
    "updateIntervalMs" INTEGER NOT NULL DEFAULT 14400000,
    "activeWindowMs" INTEGER NOT NULL DEFAULT 86400000,
    "retentionDays" INTEGER NOT NULL DEFAULT 7,
    "maxConcurrentFetches" INTEGER NOT NULL DEFAULT 5,
    "maxNewsItems" INTEGER NOT NULL DEFAULT 3,
    "maxItemChars" INTEGER NOT NULL DEFAULT 2000,
    "maxTotalChars" INTEGER NOT NULL DEFAULT 5000,
    "tavilyApiKey" TEXT NOT NULL DEFAULT '',
    "tavilyTimeRange" TEXT NOT NULL DEFAULT 'd',
    "decisionModelName" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_NewsConfig" ("id", "prefetchIntervalMs", "updateIntervalMs", "activeWindowMs", "retentionDays", "maxConcurrentFetches", "maxNewsItems", "maxItemChars", "maxTotalChars", "tavilyApiKey", "tavilyTimeRange", "decisionModelName", "updatedAt")
SELECT "id", "prefetchIntervalMs", "updateIntervalMs", "activeWindowMs", "retentionDays", "maxConcurrentFetches", "maxNewsItems", "maxItemChars", "maxTotalChars", "tavilyApiKey", "tavilyTimeRange", "decisionModelName", "updatedAt"
FROM "NewsConfig";
DROP TABLE "NewsConfig";
ALTER TABLE "new_NewsConfig" RENAME TO "NewsConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
