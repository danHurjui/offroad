import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import { prisma } from '@/lib/prisma'
import { DEMO_SECTIONS } from '@/lib/demoTour'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('sitemapPage')
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    // The rewrite leaves this route reachable at its own address as well,
    // so both URLs serve the same page. Canonical rather than a robots
    // disallow: blocking it would stop a crawler ever seeing which of the
    // two is the real one.
    alternates: { canonical: '/sitemap' },
  }
}

/**
 * The site map a person can read.
 *
 * Distinct from `/sitemap.xml`, which is the same territory written for a
 * crawler. This one exists because the app's public surface is not
 * obvious from the homepage — the parts board and the roadmap are two
 * clicks in, and a published build is reachable only through the feed —
 * and because a flat list of everything is the fastest way to answer
 * "what is on this site".
 *
 * Builds are listed newest first and capped: this is an index, not a
 * second community feed, and the feed is linked for the rest.
 *
 * ## Why the route is /sitemap-page and the URL is /sitemap
 *
 * Next reserves `src/app/sitemap.ts` for the XML file; a `sitemap/page.tsx`
 * beside it collides on the same path. next.config.mjs rewrites /sitemap
 * here, which keeps the readable URL without fighting the convention.
 */
const MAX_BUILDS = 60

export default async function SitemapPage() {
  const t = await getTranslations('sitemapPage')
  const td = await getTranslations('demo')

  const [builds, totalBuilds] = await Promise.all([
    prisma.vehicle.findMany({
      where: { isPublic: true, slug: { not: null }, owner: { username: { not: null } } },
      select: { slug: true, year: true, make: true, model: true, owner: { select: { username: true, displayName: true } } },
      orderBy: { updatedAt: 'desc' },
      take: MAX_BUILDS,
    }),
    prisma.vehicle.count({ where: { isPublic: true, slug: { not: null }, owner: { username: { not: null } } } }),
  ])

  const groups: { heading: string; links: { href: string; label: string }[] }[] = [
    {
      heading: t('main'),
      links: [
        { href: '/', label: t('home') },
        { href: '/demo', label: t('demo') },
        { href: '/donate', label: t('donate') },
        { href: '/login', label: t('logIn') },
        { href: '/register', label: t('signUp') },
      ],
    },
    {
      heading: t('communityGroup'),
      links: [
        { href: '/community', label: t('feed') },
        { href: '/community/parts-wanted', label: t('partsWanted') },
        { href: '/tickets', label: t('roadmap') },
      ],
    },
    {
      heading: t('legal'),
      links: [
        { href: '/terms', label: t('terms') },
        { href: '/privacy', label: t('privacy') },
        { href: '/cookies', label: t('cookies') },
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-2 text-3xl font-bold text-ink">{t('title')}</h1>
        <p className="mb-10 text-sm text-ink-muted">{t('intro')}</p>

        <div className="grid gap-8 sm:grid-cols-3">
          {groups.map((group) => (
            <section key={group.heading}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {group.heading}
              </h2>
              <ul className="space-y-2 text-sm">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-brand-600 hover:underline dark:text-brand-300">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Every feature's own page, by section — the same pages /sitemap.xml lists. */}
        <section className="mt-12" aria-labelledby="sitemap-features">
          <h2 id="sitemap-features" className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">{t('features')}</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {DEMO_SECTIONS.map((section) => (
              <div key={section.id}>
                <h3 className="mb-2 text-sm font-semibold text-ink">{td(`section.${section.id}.eyebrow`)}</h3>
                <ul className="space-y-1.5 text-sm">
                  {section.chapters.map((chapter) => (
                    <li key={chapter.id}>
                      <Link href={`/demo/${chapter.id}`} className="text-brand-600 hover:underline dark:text-brand-300">
                        {td(`chapter.${chapter.id}.title`)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">{t('builds')}</h2>
          {builds.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('noBuilds')}</p>
          ) : (
            <>
              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                {builds.map((build) => (
                  <li key={`${build.owner.username}/${build.slug}`}>
                    <Link
                      href={`/builds/${build.owner.username}/${build.slug}`}
                      className="text-brand-600 hover:underline dark:text-brand-300"
                    >
                      {build.year} {build.make} {build.model}
                    </Link>{' '}
                    <span className="text-ink-faint">· {build.owner.displayName}</span>
                  </li>
                ))}
              </ul>
              {totalBuilds > builds.length && (
                <p className="mt-3 text-sm text-ink-muted">
                  <Link href="/community" className="text-brand-600 hover:underline dark:text-brand-300">
                    {t('moreBuilds', { count: totalBuilds - builds.length })}
                  </Link>
                </p>
              )}
            </>
          )}
        </section>

        <p className="mt-12 text-xs text-ink-faint">
          {t.rich('xmlNote', {
            link: (chunks) => (
              <a href="/sitemap.xml" className="text-brand-600 hover:underline dark:text-brand-300">
                {chunks}
              </a>
            ),
          })}
        </p>
      </main>
      <PublicFooter />
    </div>
  )
}
