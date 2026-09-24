-- #105: a restoration's acquisition date and price paid live on Vehicle
-- only. They have been mirrored both ways since RL-045; make sure every
-- value exists on the vehicle before the intake stops reading its copy.
-- Where both are set the vehicle's wins: it is the one the cost of
-- ownership has been reading.
UPDATE "Vehicle" v
SET "purchaseDate" = fs."acquisitionDate"
FROM "FoundState" fs
WHERE fs."vehicleId" = v."id" AND v."purchaseDate" IS NULL;

UPDATE "Vehicle" v
SET "purchasePriceRon" = fs."purchasePriceRon"
FROM "FoundState" fs
WHERE fs."vehicleId" = v."id" AND v."purchasePriceRon" IS NULL AND fs."purchasePriceRon" IS NOT NULL;

-- Nothing writes the intake's copy any more, so it cannot stay required.
-- The columns themselves are dropped by the next release, once no
-- deployment that reads them is serving.
ALTER TABLE "FoundState" ALTER COLUMN "acquisitionDate" DROP NOT NULL;
