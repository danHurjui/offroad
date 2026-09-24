-- #104: a service interval per vehicle, for Car Health. Additive and
-- nullable: nothing set means the default interval, exactly as before.
ALTER TABLE "Vehicle" ADD COLUMN "serviceIntervalKm" INTEGER;
ALTER TABLE "Vehicle" ADD COLUMN "serviceIntervalMonths" INTEGER;
