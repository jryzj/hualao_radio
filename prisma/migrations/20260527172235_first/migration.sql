-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Workflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "workflowJson" TEXT NOT NULL,
    "inputParams" TEXT NOT NULL,
    "voiceInstruct" TEXT NOT NULL DEFAULT 'female, neutral, clear',
    "speed" REAL NOT NULL DEFAULT 1.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Workflow" ("createdAt", "id", "inputParams", "name", "workflowJson") SELECT "createdAt", "id", "inputParams", "name", "workflowJson" FROM "Workflow";
DROP TABLE "Workflow";
ALTER TABLE "new_Workflow" RENAME TO "Workflow";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
