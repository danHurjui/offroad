-- RL-040: driver assignments, as a history.
CREATE TABLE "VehicleAssignment" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverUserId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "note" TEXT,
    "assignedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VehicleAssignment_vehicleId_startedAt_idx" ON "VehicleAssignment"("vehicleId", "startedAt");
CREATE INDEX "VehicleAssignment_driverUserId_idx" ON "VehicleAssignment"("driverUserId");
CREATE INDEX "VehicleAssignment_assignedByUserId_idx" ON "VehicleAssignment"("assignedByUserId");

-- One active driver per vehicle, in the database. Assignments start now
-- and end now (never back-dated), so this is also what keeps the history
-- free of overlaps. Not expressible in the Prisma schema.
CREATE UNIQUE INDEX "VehicleAssignment_one_active_per_vehicle" ON "VehicleAssignment"("vehicleId") WHERE "endedAt" IS NULL;

-- An assignment cannot end before it started.
ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_ends_after_start" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt");

ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_driverUserId_fkey" FOREIGN KEY ("driverUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
