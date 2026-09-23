-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingClosedAt" TIMESTAMP(3);

-- Returning users never see the checklist.
--
-- RL-036: "once the account has one vehicle with one task, all of it is
-- gone for good". Anyone who already owns a vehicle with a logged job is
-- past what a getting-started list is for, and a checklist appearing on
-- their dashboard the day this deploys would be exactly the nag the ticket
-- rules out. Accounts with no job yet keep it: they are the ones it is for.
UPDATE "User" u
SET "onboardingClosedAt" = NOW()
WHERE EXISTS (
  SELECT 1
  FROM "Vehicle" v
  JOIN "Task" t ON t."vehicleId" = v."id"
  WHERE v."ownerId" = u."id"
);
