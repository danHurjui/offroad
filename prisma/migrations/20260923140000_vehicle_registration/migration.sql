-- RL-050 slice 1 (#49): plate and registration details. Additive and
-- nullable only; nothing existing is read differently.
ALTER TABLE "Vehicle" ADD COLUMN "plate" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "firstRegistrationDate" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN "fuelType" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "transmission" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "engineCapacityCc" INTEGER;
ALTER TABLE "Vehicle" ADD COLUMN "powerKw" INTEGER;
ALTER TABLE "Vehicle" ADD COLUMN "colour" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "seats" INTEGER;
