-- RL-040 slice 2: handover — the km at each end of an assignment, and
-- condition photos.
ALTER TABLE "VehicleAssignment" ADD COLUMN "startReadingId" TEXT;
ALTER TABLE "VehicleAssignment" ADD COLUMN "endReadingId" TEXT;

CREATE UNIQUE INDEX "VehicleAssignment_startReadingId_key" ON "VehicleAssignment"("startReadingId");
CREATE UNIQUE INDEX "VehicleAssignment_endReadingId_key" ON "VehicleAssignment"("endReadingId");

ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_startReadingId_fkey" FOREIGN KEY ("startReadingId") REFERENCES "OdometerReading"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_endReadingId_fkey" FOREIGN KEY ("endReadingId") REFERENCES "OdometerReading"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AssignmentPhoto" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssignmentPhoto_assignmentId_idx" ON "AssignmentPhoto"("assignmentId");

ALTER TABLE "AssignmentPhoto" ADD CONSTRAINT "AssignmentPhoto_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "VehicleAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
