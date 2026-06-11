-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "visitAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "deviceModel" TEXT NOT NULL,
    "deviceOs" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT 0,
    "path" TEXT NOT NULL DEFAULT '/',
    "userAgent" TEXT NOT NULL DEFAULT ''
);

-- CreateIndex
CREATE INDEX "Visitor_visitAt_idx" ON "Visitor"("visitAt");

-- CreateIndex
CREATE INDEX "Visitor_ip_idx" ON "Visitor"("ip");
