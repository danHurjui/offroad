-- RL-049 slice 7 (#49): passport share links. A new table only.
-- CreateTable
CREATE TABLE "PassportLink" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "showPlate" BOOLEAN NOT NULL DEFAULT false,
    "showVin" BOOLEAN NOT NULL DEFAULT false,
    "showCosts" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PassportLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PassportLink_token_key" ON "PassportLink"("token");

-- CreateIndex
CREATE INDEX "PassportLink_vehicleId_idx" ON "PassportLink"("vehicleId");

-- AddForeignKey
ALTER TABLE "PassportLink" ADD CONSTRAINT "PassportLink_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

