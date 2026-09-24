-- #103: named sites (depots) for an organisation, and the one a company
-- vehicle belongs to. Additive: no site means the whole organisation, as
-- before. Deleting a site unassigns its vehicles and never deletes them.
CREATE TABLE "OrganizationSite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationSite_organizationId_name_key" ON "OrganizationSite"("organizationId", "name");

ALTER TABLE "OrganizationSite" ADD CONSTRAINT "OrganizationSite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Vehicle" ADD COLUMN "siteId" TEXT;

CREATE INDEX "Vehicle_siteId_idx" ON "Vehicle"("siteId");

ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "OrganizationSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
