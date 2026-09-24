-- RL-042 (#54) slice 3: organisations pay for the company plans.
CREATE TYPE "OrgPlan" AS ENUM (
  'PRO_MONTHLY', 'PRO_ANNUAL',
  'BUSINESS_MONTHLY', 'BUSINESS_ANNUAL',
  'FLEET_100_MONTHLY', 'FLEET_100_ANNUAL',
  'FLEET_250_MONTHLY', 'FLEET_250_ANNUAL',
  'FLEET_500_MONTHLY', 'FLEET_500_ANNUAL'
);

ALTER TABLE "Organization"
  ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT,
  ADD COLUMN "plan" "OrgPlan",
  ADD COLUMN "paymentFailedAt" TIMESTAMP(3),
  ADD COLUMN "compedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");
CREATE UNIQUE INDEX "Organization_stripeSubscriptionId_key" ON "Organization"("stripeSubscriptionId");

-- Every organisation from the closed beta keeps working exactly as it
-- does: no charge and no vehicle cap. Without this, the day billing ships
-- each of them would have an allowance of none and every company vehicle
-- would turn read-only.
UPDATE "Organization" SET "compedAt" = NOW();
