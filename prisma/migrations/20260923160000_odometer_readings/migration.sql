-- RL-044 slice 2 (#49): odometer history. A new table only; nothing
-- existing is altered.
CREATE TABLE "OdometerReading" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "km" INTEGER NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "taskId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OdometerReading_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OdometerReading_taskId_key" ON "OdometerReading"("taskId");
CREATE INDEX "OdometerReading_vehicleId_readAt_idx" ON "OdometerReading"("vehicleId", "readAt");
CREATE INDEX "OdometerReading_createdByUserId_idx" ON "OdometerReading"("createdByUserId");

ALTER TABLE "OdometerReading" ADD CONSTRAINT "OdometerReading_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OdometerReading" ADD CONSTRAINT "OdometerReading_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OdometerReading" ADD CONSTRAINT "OdometerReading_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The restoration intake's odometer becomes the first reading, so there
-- is one history rather than a snapshot and a history that can disagree.
-- FoundState.odometer stays (additive-only rule); from here on the
-- found-state route keeps the two in step.
INSERT INTO "OdometerReading" ("id", "vehicleId", "km", "readAt", "source", "createdByUserId")
SELECT 'fs_' || fs."id", fs."vehicleId", fs."odometer", date_trunc('day', fs."acquisitionDate"), 'FOUND_STATE', v."ownerId"
FROM "FoundState" fs
JOIN "Vehicle" v ON v."id" = fs."vehicleId"
WHERE fs."odometer" IS NOT NULL;
