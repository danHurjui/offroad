-- AlterTable
ALTER TABLE "User" ADD COLUMN     "foundingNumber" INTEGER;

-- CreateTable
CREATE TABLE "FoundingMemberCounter" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "taken" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoundingMemberCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_foundingNumber_key" ON "User"("foundingNumber");

