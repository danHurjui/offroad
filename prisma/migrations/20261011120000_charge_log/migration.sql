-- RL-053 (#121): the charging log. Additive only.
ALTER TABLE "Vehicle" ADD COLUMN "homeTariffRonPerKwh" DECIMAL(6,4);

CREATE TABLE "ChargeEntry" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kwh" DECIMAL(8,2),
    "totalRon" DECIMAL(10,2) NOT NULL,
    "totalFromTariff" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT NOT NULL,
    "network" TEXT,
    "socFrom" INTEGER,
    "socTo" INTEGER,
    "receiptUrl" TEXT,
    "odometerReadingId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChargeEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChargeEntry_odometerReadingId_key" ON "ChargeEntry"("odometerReadingId");
CREATE INDEX "ChargeEntry_vehicleId_date_idx" ON "ChargeEntry"("vehicleId", "date");

ALTER TABLE "ChargeEntry" ADD CONSTRAINT "ChargeEntry_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChargeEntry" ADD CONSTRAINT "ChargeEntry_odometerReadingId_fkey" FOREIGN KEY ("odometerReadingId") REFERENCES "OdometerReading"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChargeEntry" ADD CONSTRAINT "ChargeEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
