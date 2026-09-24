-- RL-056: the battery warranty reminder (sent once), and correctable readings. Additive only.
ALTER TABLE "Vehicle" ADD COLUMN "batteryWarrantyRemindedAt" TIMESTAMP(3);

-- Existing readings were never changed: their last change is their entry.
ALTER TABLE "BatteryHealthReading" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "BatteryHealthReading" SET "updatedAt" = "createdAt";
ALTER TABLE "BatteryHealthReading" ALTER COLUMN "updatedAt" SET NOT NULL;
