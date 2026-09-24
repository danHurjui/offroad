-- RL-042 (#54): the pricing ladder.
--
-- The plans sold until now (MONTHLY/ANNUAL/LIFETIME) stay in the enum for
-- the people who hold them; Personal is what is sold from here on.
ALTER TYPE "ProPlan" ADD VALUE 'PERSONAL_MONTHLY';
ALTER TYPE "ProPlan" ADD VALUE 'PERSONAL_ANNUAL';
ALTER TYPE "ProPlan" ADD VALUE 'PERSONAL_LIFETIME';

-- Everyone who holds Pro today — paying, Lifetime, founding member or
-- comped by an admin — keeps it with no vehicle cap. Stamped with the day
-- of the change, not their own start: what the column records is that
-- they held it when the ladder arrived.
ALTER TABLE "User" ADD COLUMN "grandfatheredAt" TIMESTAMP(3);
UPDATE "User" SET "grandfatheredAt" = NOW() WHERE "isPro" = true OR "isProComped" = true;
