import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { appUrlForMetadata } from '@/lib/appUrl'
import { DEMO_CHAPTERS } from '@/lib/demoTour'
import { LEGAL_LAST_UPDATED } from '@/lib/legal'
import { englishPath, hasEnglishVersion } from '@/i18n/localeRoutes'

/**
 * RL-018: every URL a crawler is allowed to have, so search engines find
 * them without needing an inbound link first.
 *
 * Forced dynamic rather than baked into the build, so a newly-published
 * vehicle appears without waiting for the next deploy — and so the build
 * needs no database, which is not guaranteed in CI or a local build.
 *
 * ## What belongs here
 *
 * Exactly what robots.ts allows. The two files are a pair: listing a URL
 * here that robots disallows earns a "Blocked by robots.txt" warning in
 * Search Console for every one of them, and allowing a URL that appears
 * nowhere here leaves it to be found by luck. Anything behind a session —
 * the whole dashboard, the collaborator accept flow, the API — is in
 * neither.
 *
 * ## Two addresses for our own pages, one for everybody else's
 *
 * The homepage, the tour and its feature pages, donate, the legal pages
 * and the readable site map have an English address as well
 * (src/i18n/localeRoutes.ts): both are listed, each declaring the pair as
 * hreflang alternates, Romanian as `x-default`. A build, a ticket or a
 * parts request is somebody's own words in one language, so it has one
 * URL, as do the community pages, which are mostly those.
 *
 * ## lastmod is only ever a real date
 *
 * Google ignores `changefreq` and `priority` but uses `lastmod` — as long
 * as it proves accurate, and it stops trusting a site's once it does not.
 * So a page gets one only when something here knows when it changed: a
 * build page its vehicle's update, the feed and the boards their newest
 * entry, the legal pages `LEGAL_LAST_UPDATED`. The homepage and the tour
 * change with deploys and nothing records when, so they have none rather
 * than "now" on every fetch, which is the pattern that gets ignored.
 */
export const dynamic = 'force-dynamic'

/**
 * Bounds on the two open-ended lists.
 *
 * The sitemap protocol caps a file at 50,000 URLs, and this app is far
 * from that — but a board with years of tickets on it should not be able
 * to crowd out the build pages, which are the content worth ranking.
 * Newest first, since those are the ones a crawler has not seen.
 */
const MAX_TICKETS = 2000
const MAX_PARTS_REQUESTS = 2000

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = appUrlForMetadata()

  const [vehicles, tickets, partsRequests] = await Promise.all([
    prisma.vehicle.findMany({
      where: { isPublic: true, slug: { not: null } },
      select: { slug: true, updatedAt: true, owner: { select: { username: true } } },
    }),
    // Reading the feedback board needs no session, and each ticket is a
    // page of its own — they were missing entirely.
    prisma.ticket.findMany({
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: MAX_TICKETS,
    }),
    prisma.partsRequest.findMany({
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: MAX_PARTS_REQUESTS,
    }),
  ])

  const newest = (dates: Date[]) => (dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : undefined)
  const legal = new Date(`${LEGAL_LAST_UPDATED}T00:00:00Z`)

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: 'monthly', priority: 1 },
    // The feature tour. Second only to the homepage: it is the page that
    // answers "what is this", and the one worth ranking for the question.
    { url: `${baseUrl}/demo`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/community`, lastModified: newest(vehicles.map((v) => v.updatedAt)), changeFrequency: 'daily', priority: 0.8 },
    // Public, and reachable from the community feed — but absent here, so
    // it depended on a crawler following that link.
    { url: `${baseUrl}/community/parts-wanted`, lastModified: newest(partsRequests.map((r) => r.updatedAt)), changeFrequency: 'daily', priority: 0.7 },
    { url: `${baseUrl}/tickets`, lastModified: newest(tickets.map((t) => t.updatedAt)), changeFrequency: 'daily', priority: 0.6 },
    { url: `${baseUrl}/donate`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/terms`, lastModified: legal, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified: legal, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/cookies`, lastModified: legal, changeFrequency: 'yearly', priority: 0.3 },
    // The readable site map. Low priority — it is a way in for a crawler
    // that has only found the homepage, not a page worth ranking itself.
    { url: `${baseUrl}/sitemap`, changeFrequency: 'weekly', priority: 0.2 },
  ]

  // Each feature of the tour on its own page — the pages that answer a
  // specific search ("reminder ITP", "consum mașină electrică").
  const featurePages: MetadataRoute.Sitemap = DEMO_CHAPTERS.map((chapter) => ({
    url: `${baseUrl}/demo/${chapter.id}`,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  // Each page with an English address, listed twice, the pair declared on both.
  const withEnglish = (entries: MetadataRoute.Sitemap): MetadataRoute.Sitemap =>
    entries.flatMap((entry) => {
      const path = entry.url.slice(baseUrl.length) || '/'
      if (!hasEnglishVersion(path)) return [entry]
      const alternates = { languages: { ro: `${baseUrl}${path === '/' ? '' : path}`, en: `${baseUrl}${englishPath(path)}`, 'x-default': `${baseUrl}${path === '/' ? '' : path}` } }
      return [
        { ...entry, alternates },
        { ...entry, url: `${baseUrl}${englishPath(path)}`, alternates },
      ]
    })

  return [
    ...withEnglish([...staticPages, ...featurePages]),
    ...vehicles
      .filter((v) => v.owner.username && v.slug)
      .map((v) => ({
        url: `${baseUrl}/builds/${v.owner.username}/${v.slug}`,
        lastModified: v.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.9,
      })),
    ...tickets.map((t) => ({
      url: `${baseUrl}/tickets/${t.id}`,
      lastModified: t.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.4,
    })),
    ...partsRequests.map((r) => ({
      url: `${baseUrl}/community/parts-wanted/${r.id}`,
      lastModified: r.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
  ]
}
