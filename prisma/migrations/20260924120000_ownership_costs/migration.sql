-- RL-045 slice 5 (#49): cost of ownership. Additive only: nullable columns
-- and one new table, plus a backfill of the purchase from FoundState.
-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "costRon" DECIMAL(10,2),
ADD COLUMN     "paidAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TyreSet" ADD COLUMN     "costRon" DECIMAL(10,2),
ADD COLUMN     "purchasedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "currentValueAt" TIMESTAMP(3),
ADD COLUMN     "currentValueRon" DECIMAL(10,2),
ADD COLUMN     "financeEndDate" TIMESTAMP(3),
ADD COLUMN     "financeMonthlyRon" DECIMAL(10,2),
ADD COLUMN     "financeStartDate" TIMESTAMP(3),
ADD COLUMN     "financeType" TEXT,
ADD COLUMN     "purchaseDate" TIMESTAMP(3),
ADD COLUMN     "purchasePriceRon" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "VehicleExpense" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "amountRon" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleExpense_vehicleId_date_idx" ON "VehicleExpense"("vehicleId", "date");

-- CreateIndex
CREATE INDEX "VehicleExpense_createdByUserId_idx" ON "VehicleExpense"("createdByUserId");

-- AddForeignKey
ALTER TABLE "VehicleExpense" ADD CONSTRAINT "VehicleExpense_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleExpense" ADD CONSTRAINT "VehicleExpense_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A restoration's purchase moves onto the vehicle, where every mode can
-- have one. FoundState keeps its copy for now (mirrored both ways by the
-- routes), so a rollback of the code loses nothing.
UPDATE "Vehicle" v
SET "purchaseDate" = f."acquisitionDate",
    "purchasePriceRon" = f."purchasePriceRon"
FROM "FoundState" f
WHERE f."vehicleId" = v."id";
