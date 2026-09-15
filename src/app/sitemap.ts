import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'

// RL-018: lists every public vehicle's URL so search engines discover
// them without needing an inbound link first. Forced dynamic (rather than
// baked into the build) so a newly-published vehicle shows up without
// waiting for the next deploy — also avoids needing DB access at build
// time, which isn't guaranteed (e.g. this repo's own CI/local builds).
export const dynamic = 'force-dynamic'
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

  const vehicles = await prisma.vehicle.findMany({
    where: { isPublic: true, slug: { not: null } },
    select: { slug: true, updatedAt: true, owner: { select: { username: true } } },
  })

  return vehicles
    .filter((v) => v.owner.username && v.slug)
    .map((v) => ({
      url: `${baseUrl}/builds/${v.owner.username}/${v.slug}`,
      lastModified: v.updatedAt,
    }))
}
