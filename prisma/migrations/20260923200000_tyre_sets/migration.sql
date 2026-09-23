-- RL-050 tyres / RL-046 slice 4 (#49): a new table only.
CREATE TABLE "TyreSet" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "label" TEXT,
    "size" TEXT,
    "dotYear" INTEGER,
    "isFitted" BOOLEAN NOT NULL DEFAULT false,
    "fittedAt" TIMESTAMP(3),
    "fittedKm" INTEGER,
    "treadDepthMm" DECIMAL(3,1),
    "treadMeasuredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TyreSet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TyreSet_vehicleId_idx" ON "TyreSet"("vehicleId");
CREATE INDEX "TyreSet_createdByUserId_idx" ON "TyreSet"("createdByUserId");

ALTER TABLE "TyreSet" ADD CONSTRAINT "TyreSet_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TyreSet" ADD CONSTRAINT "TyreSet_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
