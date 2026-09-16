import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { appUrlForMetadata } from '@/lib/appUrl'

// RL-018: lists every public vehicle's URL so search engines discover
// them without needing an inbound link first. Forced dynamic (rather than
// baked into the build) so a newly-published vehicle shows up without
// waiting for the next deploy — also avoids needing DB access at build
// time, which isn't guaranteed (e.g. this repo's own CI/local builds).
export const dynamic = 'force-dynamic'
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = appUrlForMetadata()

  const vehicles = await prisma.vehicle.findMany({
    where: { isPublic: true, slug: { not: null } },
    select: { slug: true, updatedAt: true, owner: { select: { username: true } } },
  })

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: 'monthly', priority: 1 },
    { url: `${baseUrl}/community`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/tickets`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${baseUrl}/donate`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/cookies`, changeFrequency: 'yearly', priority: 0.3 },
  ]

  return [
    ...staticPages,
    ...vehicles
      .filter((v) => v.owner.username && v.slug)
      .map((v) => ({
        url: `${baseUrl}/builds/${v.owner.username}/${v.slug}`,
        lastModified: v.updatedAt,
      })),
  ]
}
