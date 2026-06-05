-- This is the canonical initial migration generated from the current
-- schema.prisma via `prisma migrate diff --from-empty --to-schema ...`.
-- All previous per-feature migrations were dropped because they had
-- drifted from the schema (missing columns / tables / indexes).
-- Going forward, schema changes must be captured with `prisma migrate dev`
-- and committed alongside schema.prisma — never `prisma db push`.

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "workflowJson" TEXT NOT NULL,
    "inputParams" TEXT NOT NULL,
    "refAudioPath" TEXT,
    "refText" TEXT,
    "speed" REAL NOT NULL DEFAULT 1.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "prompt" TEXT NOT NULL DEFAULT '',
    "userPrompt" TEXT NOT NULL DEFAULT '请生成下一段直播内容。',
    "audiencePrompt" TEXT NOT NULL DEFAULT '',
    "historyRounds" INTEGER NOT NULL DEFAULT 5,
    "personaId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Theme_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Theme_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "authorName" TEXT NOT NULL DEFAULT '匿名用户',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "aiReason" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "LLMConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apiUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ComfyUIConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverUrl" TEXT NOT NULL,
    "comfyuiToken" TEXT NOT NULL DEFAULT '',
    "webhookUrl" TEXT NOT NULL,
    "pollTimeoutMs" INTEGER NOT NULL DEFAULT 120000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ModerationPrompt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prompt" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AudioBufferConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prebufferSentences" INTEGER NOT NULL DEFAULT 3,
    "prebufferSeconds" INTEGER NOT NULL DEFAULT 8,
    "prebufferMode" TEXT NOT NULL DEFAULT 'sentences',
    "prebufferGroupSize" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "NewsConfig" (
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

-- CreateTable
CREATE TABLE "MessageConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "maxVisibleMessages" INTEGER NOT NULL DEFAULT 50,
    "frontendVisible" BOOLEAN NOT NULL DEFAULT true,
    "scrollSpeedSeconds" INTEGER NOT NULL DEFAULT 80,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "RssSource_url_key" ON "RssSource"("url");

-- CreateIndex
CREATE INDEX "RssItem_publishedAt_idx" ON "RssItem"("publishedAt");

-- CreateIndex
CREATE INDEX "RssItem_fetchedAt_idx" ON "RssItem"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RssItem_sourceId_link_key" ON "RssItem"("sourceId", "link");
