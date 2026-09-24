-- RL-056 (#124): battery health readings and the traction-battery warranty. Additive only.
ALTER TABLE "Vehicle" ADD COLUMN "batteryWarrantyUntil" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN "batteryWarrantyKm" INTEGER;

CREATE TABLE "BatteryHealthReading" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "sohPercent" INTEGER NOT NULL,
    "km" INTEGER,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "reportUrl" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatteryHealthReading_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BatteryHealthReading_sohPercent_check" CHECK ("sohPercent" BETWEEN 1 AND 100)
);

CREATE INDEX "BatteryHealthReading_vehicleId_date_idx" ON "BatteryHealthReading"("vehicleId", "date");

ALTER TABLE "BatteryHealthReading" ADD CONSTRAINT "BatteryHealthReading_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatteryHealthReading" ADD CONSTRAINT "BatteryHealthReading_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
