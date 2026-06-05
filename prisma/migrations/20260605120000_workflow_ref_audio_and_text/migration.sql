-- Replace voiceInstruct with refAudioPath + refText on Workflow.
-- voiceInstruct is no longer referenced by code; the new fields are
-- nullable and have no default (a fresh row leaves both null until
-- the admin UI uploads audio / saves ref text).

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Workflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "workflowJson" TEXT NOT NULL,
    "inputParams" TEXT NOT NULL,
    "refAudioPath" TEXT,
    "refText" TEXT,
    "speed" REAL NOT NULL DEFAULT 1.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Workflow" ("createdAt", "id", "inputParams", "name", "speed", "workflowJson") SELECT "createdAt", "id", "inputParams", "name", "speed", "workflowJson" FROM "Workflow";
DROP TABLE "Workflow";
ALTER TABLE "new_Workflow" RENAME TO "Workflow";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
