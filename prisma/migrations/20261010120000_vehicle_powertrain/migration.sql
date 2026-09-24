-- RL-052 (#120): battery and charging specification for vehicles that plug
-- in. Additive and all optional; existing rows get no battery and no
-- connectors, which is what they had.
ALTER TABLE "Vehicle" ADD COLUMN "batteryCapacityKwh" DOUBLE PRECISION;
ALTER TABLE "Vehicle" ADD COLUMN "connectorTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Vehicle" ADD COLUMN "maxAcKw" INTEGER;
ALTER TABLE "Vehicle" ADD COLUMN "maxDcKw" INTEGER;
