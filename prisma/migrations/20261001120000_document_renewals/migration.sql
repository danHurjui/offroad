-- RL-041: the expiry a document had before each renewal, so a fleet report
-- can say what expired in a period and when it was renewed. Nothing is
-- backfilled: renewals before this release were never recorded.
CREATE TABLE "DocumentRenewal" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "previousExpiry" TIMESTAMP(3) NOT NULL,
    "newExpiry" TIMESTAMP(3) NOT NULL,
    "renewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renewedByUserId" TEXT,

    CONSTRAINT "DocumentRenewal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentRenewal_documentId_renewedAt_idx" ON "DocumentRenewal"("documentId", "renewedAt");
CREATE INDEX "DocumentRenewal_renewedByUserId_idx" ON "DocumentRenewal"("renewedByUserId");

ALTER TABLE "DocumentRenewal" ADD CONSTRAINT "DocumentRenewal_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentRenewal" ADD CONSTRAINT "DocumentRenewal_renewedByUserId_fkey" FOREIGN KEY ("renewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
