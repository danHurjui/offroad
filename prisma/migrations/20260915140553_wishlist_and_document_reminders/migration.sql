-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "reminder14SentAt" TIMESTAMP(3),
ADD COLUMN     "reminder30SentAt" TIMESTAMP(3),
ADD COLUMN     "reminder3SentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WishlistItem" ADD COLUMN     "notes" TEXT;
