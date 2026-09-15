-- AlterTable
ALTER TABLE "TrailRun" ADD COLUMN     "elevationGainM" INTEGER,
ADD COLUMN     "trackGeoJson" JSONB;

-- CreateTable
CREATE TABLE "TrailWaypoint" (
    "id" TEXT NOT NULL,
    "trailRunId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "photoUrl" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrailWaypoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrailWaypoint_trailRunId_idx" ON "TrailWaypoint"("trailRunId");

-- AddForeignKey
ALTER TABLE "TrailWaypoint" ADD CONSTRAINT "TrailWaypoint_trailRunId_fkey" FOREIGN KEY ("trailRunId") REFERENCES "TrailRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

