-- RL-044 slice 3 (#49): the fuel log. A new table only; nothing existing
-- is altered.
CREATE TABLE "FuelEntry" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "litres" DECIMAL(8,2) NOT NULL,
    "totalRon" DECIMAL(10,2) NOT NULL,
    "isFullTank" BOOLEAN NOT NULL DEFAULT true,
    "station" TEXT,
    "receiptUrl" TEXT,
    "odometerReadingId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FuelEntry_odometerReadingId_key" ON "FuelEntry"("odometerReadingId");
CREATE INDEX "FuelEntry_vehicleId_date_idx" ON "FuelEntry"("vehicleId", "date");
CREATE INDEX "FuelEntry_createdByUserId_idx" ON "FuelEntry"("createdByUserId");

ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_odometerReadingId_fkey" FOREIGN KEY ("odometerReadingId") REFERENCES "OdometerReading"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FuelEntry" ADD CONSTRAINT "FuelEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
