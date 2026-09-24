-- #105, part 2: FoundState's copy of the purchase. The previous release
-- moved every value onto Vehicle (purchaseDate / purchasePriceRon) and
-- stopped reading and writing these, so no deployment still serving
-- selects them.
ALTER TABLE "FoundState" DROP COLUMN "acquisitionDate";
ALTER TABLE "FoundState" DROP COLUMN "purchasePriceRon";
