-- Add MessageConfig table to control how many latest approved+visible
-- messages are returned by the public /api/messages endpoint.
-- Single-row config: defaults to 50 latest messages.

-- CreateTable
CREATE TABLE "MessageConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "maxVisibleMessages" INTEGER NOT NULL DEFAULT 50,
    "updatedAt" DATETIME NOT NULL
);
