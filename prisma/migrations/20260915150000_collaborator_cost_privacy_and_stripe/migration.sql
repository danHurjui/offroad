-- CreateEnum
CREATE TYPE "ProPlan" AS ENUM ('MONTHLY', 'ANNUAL', 'LIFETIME');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "proPaymentFailedAt" TIMESTAMP(3),
ADD COLUMN     "proPlan" "ProPlan",
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "hideCostsFromCollaborators" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeSubscriptionId_key" ON "User"("stripeSubscriptionId");

