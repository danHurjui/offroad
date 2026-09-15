import { prisma } from '@/lib/prisma'
import { slugify, uniqueSlug } from '@/lib/slug'

/**
 * RL-018: generates a slug unique within one owner's vehicles (not
 * globally — the public URL is /builds/[username]/[slug], so the owner's
 * username already disambiguates). Called at vehicle creation, and as a
 * lazy backfill in PATCH /api/vehicles/[id] for any vehicle created before
 * this ticket shipped.
 */
export async function generateVehicleSlug(ownerId: string, year: number, make: string, model: string): Promise<string> {
  const base = slugify(`${year}-${make}-${model}`)
  return uniqueSlug(base, async (candidate) => {
    const existing = await prisma.vehicle.findFirst({ where: { ownerId, slug: candidate }, select: { id: true } })
    return Boolean(existing)
  })
}
