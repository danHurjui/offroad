-- AlterTable
ALTER TABLE "User" ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "hidePublicCost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Vehicle_isPublic_idx" ON "Vehicle"("isPublic");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_ownerId_slug_key" ON "Vehicle"("ownerId", "slug");

