-- RL-038 slice 3: a vehicle can belong to an organisation. Access to such a
-- vehicle comes from membership (src/lib/access.ts), not from ownerId.
ALTER TABLE "Vehicle" ADD COLUMN "organizationId" TEXT;

CREATE INDEX "Vehicle_organizationId_idx" ON "Vehicle"("organizationId");

ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A company vehicle is never public: its public page would sit under one
-- person's username. Not expressible in the Prisma schema, so it lives here.
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_company_not_public" CHECK ("organizationId" IS NULL OR "isPublic" = false);
