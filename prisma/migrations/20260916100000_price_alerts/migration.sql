-- AlterTable
ALTER TABLE "WishlistItem" ADD COLUMN     "priceAlertSentAt" TIMESTAMP(3),
ADD COLUMN     "targetPriceRon" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "WishlistPriceEntry" (
    "id" TEXT NOT NULL,
    "wishlistItemId" TEXT NOT NULL,
    "priceRon" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistPriceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WishlistPriceEntry_wishlistItemId_idx" ON "WishlistPriceEntry"("wishlistItemId");

-- AddForeignKey
ALTER TABLE "WishlistPriceEntry" ADD CONSTRAINT "WishlistPriceEntry_wishlistItemId_fkey" FOREIGN KEY ("wishlistItemId") REFERENCES "WishlistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

