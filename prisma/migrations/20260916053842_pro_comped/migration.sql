-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isProComped" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proCompedAt" TIMESTAMP(3),
ADD COLUMN     "proCompedById" TEXT,
ADD COLUMN     "proCompedReason" TEXT;
