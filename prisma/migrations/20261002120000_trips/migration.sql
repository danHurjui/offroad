-- RL-051: trips for the trip sheet. The distance is not stored: each end
-- is an OdometerReading (source TRIP) written with the trip.
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverUserId" TEXT,
    "driverName" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "fromPlace" TEXT NOT NULL,
    "toPlace" TEXT NOT NULL,
    "purpose" TEXT,
    "kind" TEXT NOT NULL,
    "startReadingId" TEXT,
    "endReadingId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Trip_kind_check" CHECK ("kind" IN ('BUSINESS', 'PERSONAL'))
);

CREATE UNIQUE INDEX "Trip_startReadingId_key" ON "Trip"("startReadingId");
CREATE UNIQUE INDEX "Trip_endReadingId_key" ON "Trip"("endReadingId");
CREATE INDEX "Trip_vehicleId_date_idx" ON "Trip"("vehicleId", "date");
CREATE INDEX "Trip_driverUserId_date_idx" ON "Trip"("driverUserId", "date");
CREATE INDEX "Trip_createdByUserId_idx" ON "Trip"("createdByUserId");

ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverUserId_fkey" FOREIGN KEY ("driverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_startReadingId_fkey" FOREIGN KEY ("startReadingId") REFERENCES "OdometerReading"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_endReadingId_fkey" FOREIGN KEY ("endReadingId") REFERENCES "OdometerReading"("id") ON DELETE SET NULL ON UPDATE CASCADE;
