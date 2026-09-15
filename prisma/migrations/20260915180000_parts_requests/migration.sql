-- CreateEnum
CREATE TYPE "PartsRequestStatus" AS ENUM ('OPEN', 'FOUND');

-- CreateTable
CREATE TABLE "PartsRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleMake" TEXT NOT NULL,
    "vehicleModel" TEXT NOT NULL,
    "partName" TEXT NOT NULL,
    "partNumber" TEXT,
    "conditionAccepted" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT,
    "status" "PartsRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartsRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartsRequestComment" (
    "id" TEXT NOT NULL,
    "partsRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartsRequestComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartsRequest_userId_idx" ON "PartsRequest"("userId");

-- CreateIndex
CREATE INDEX "PartsRequest_status_idx" ON "PartsRequest"("status");

-- CreateIndex
CREATE INDEX "PartsRequestComment_partsRequestId_idx" ON "PartsRequestComment"("partsRequestId");

-- AddForeignKey
ALTER TABLE "PartsRequest" ADD CONSTRAINT "PartsRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartsRequestComment" ADD CONSTRAINT "PartsRequestComment_partsRequestId_fkey" FOREIGN KEY ("partsRequestId") REFERENCES "PartsRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartsRequestComment" ADD CONSTRAINT "PartsRequestComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

