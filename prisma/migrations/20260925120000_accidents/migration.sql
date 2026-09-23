-- RL-050 accidents and damage, slice 8 of #49: two new tables only.
CREATE TABLE "Accident" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "km" INTEGER,
    "insurance" TEXT,
    "repairCostRon" DECIMAL(10,2),
    "repairedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Accident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccidentPhoto" (
    "id" TEXT NOT NULL,
    "accidentId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccidentPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Accident_vehicleId_date_idx" ON "Accident"("vehicleId", "date");
CREATE INDEX "Accident_createdByUserId_idx" ON "Accident"("createdByUserId");
CREATE INDEX "AccidentPhoto_accidentId_idx" ON "AccidentPhoto"("accidentId");

ALTER TABLE "Accident" ADD CONSTRAINT "Accident_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Accident" ADD CONSTRAINT "Accident_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccidentPhoto" ADD CONSTRAINT "AccidentPhoto_accidentId_fkey" FOREIGN KEY ("accidentId") REFERENCES "Accident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
