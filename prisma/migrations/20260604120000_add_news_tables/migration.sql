-- CreateTable RssSource
CREATE TABLE "RssSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT '',
    "htmlUrl" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "lastFetchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable RssItem
CREATE TABLE "RssItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "contentMd" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RssItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RssSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable NewsConfig
CREATE TABLE "NewsConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prefetchIntervalMs" INTEGER NOT NULL DEFAULT 300000,
    "updateIntervalMs" INTEGER NOT NULL DEFAULT 14400000,
    "activeWindowMs" INTEGER NOT NULL DEFAULT 14400000,
    "retentionDays" INTEGER NOT NULL DEFAULT 7,
    "maxConcurrentFetches" INTEGER NOT NULL DEFAULT 5,
    "tavilyApiKey" TEXT NOT NULL DEFAULT '',
    "tavilyTimeRange" TEXT NOT NULL DEFAULT 'd',
    "decisionModelName" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "RssSource_url_key" ON "RssSource"("url");
CREATE UNIQUE INDEX "RssItem_sourceId_link_key" ON "RssItem"("sourceId", "link");
CREATE INDEX "RssItem_publishedAt_idx" ON "RssItem"("publishedAt");
CREATE INDEX "RssItem_fetchedAt_idx" ON "RssItem"("fetchedAt");

-- FTS5 virtual table for full-text search on RssItem title + contentMd
CREATE VIRTUAL TABLE "rss_item_fts" USING fts5(
    "title",
    "contentMd",
    content='RssItem',
    content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
);

-- Sync triggers: keep FTS5 in sync with RssItem
CREATE TRIGGER "rss_item_ai" AFTER INSERT ON "RssItem" BEGIN
    INSERT INTO "rss_item_fts"(rowid, title, contentMd) VALUES (new.rowid, new.title, new.contentMd);
END;

CREATE TRIGGER "rss_item_ad" AFTER DELETE ON "RssItem" BEGIN
    INSERT INTO "rss_item_fts"(rss_item_fts, rowid, title, contentMd) VALUES('delete', old.rowid, old.title, old.contentMd);
END;

CREATE TRIGGER "rss_item_au" AFTER UPDATE ON "RssItem" BEGIN
    INSERT INTO "rss_item_fts"(rss_item_fts, rowid, title, contentMd) VALUES('delete', old.rowid, old.title, old.contentMd);
    INSERT INTO "rss_item_fts"(rowid, title, contentMd) VALUES (new.rowid, new.title, new.contentMd);
END;
