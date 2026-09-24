import Link from 'next/link'
import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { appUrlForMetadata } from '@/lib/appUrl'
import { publicPageMetadata } from '@/lib/pageMetadata'
import { breadcrumbJsonLd, softwareApplicationJsonLd } from '@/lib/structuredData'
import { DEMO_FAQ_IDS, DEMO_SECTIONS, TIER_LABEL_KEY } from '@/lib/demoTour'
import { FREE_TIER } from '@/lib/pro'
import { formatPlanPrice, LADDER } from '@/lib/plans'
import JsonLd from '@/components/JsonLd'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import DemoExplorer from '@/components/demo/DemoExplorer'
import { demoPreviews } from '@/components/demo/demoPreviews'
import { localizedHref } from '@/i18n/localizedHref'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('demo')
  return await publicPageMetadata({
    path: '/demo',
    title: t('metaTitle'),
    description: t('metaDescription'),
  })
}

/**
 * The public tour: what RigLog does, shown rather than listed, with no
 * account and no session.
 *
 * ## Why this is mock-ups and not a demo account
 *
 * The obvious alternative is a shared logged-in account with seeded data.
 * It is worse on every axis that matters here: it is a real account, so
 * it is writable by everyone who finds it and looks vandalised by the
 * second visitor; it needs seeding, resetting and its own moderation; and
 * it cannot show a Pro feature without either granting Pro to an account
 * anyone can use or showing the upgrade wall instead of the feature. The
 * previews draw the same components against invented rows, label
 * themselves as samples, and cost nothing to keep alive.
 *
 * ## What keeps it honest
 *
 * The three things a tour gets wrong as the product moves are the
 * vocabulary, the plan boundary, and the numbers. So none of them are
 * written here: the categories and statuses come from
 * `PROJECT_TYPE_CONFIG` through the vocabulary helpers, the free-tier
 * limits from `FREE_TIER` via `chapterValues()`, the prices from
 * the ladder (`LADDER`, src/lib/plans.ts), and which chapter is Pro is declared in
 * `src/lib/demoTour.ts` beside a test. Several previews go further and
 * run the real thing — `VinPreview` actually decodes a chassis number,
 * `ShortcutsPreview` reads `SHORTCUTS`, `OriginalityPreview` uses the
 * real condition vocabulary — so they cannot describe behaviour the app
 * no longer has.
 *
 * ## Server-rendered previews inside a client explorer
 *
 * `DemoExplorer` is a Client Component because picking a category and a
 * feature is what makes this a tour rather than a list. The previews
 * stay Server Components and are handed to it as a map of nodes: they
 * read translations and, in one case, run a decoder, and none of that
 * needs to reach the browser. React renders them on the server and the
 * explorer only chooses which one is on screen.
 */
export default async function DemoPage() {
  const t = await getTranslations('demo')
  const locale = await getLocale()

  const previews = await demoPreviews()


  const featureCount = DEMO_SECTIONS.reduce((sum, section) => sum + section.chapters.length, 0)

  const origin = appUrlForMetadata()

  return (
    <div className="min-h-screen bg-background">
      {/*
        What the page is, stated for a machine.

        `featureList` is built from the tour itself, so a feature added
        there is advertised here and one removed stops being advertised —
        structured data that describes something the page does not show is
        a spam-policy violation, not just untidy.
      */}
      <JsonLd
        data={softwareApplicationJsonLd(
          {
            url: origin,
            name: 'RigLog',
            description: t('metaDescription'),
            inLanguage: locale,
          },
          DEMO_SECTIONS.flatMap((section) =>
            section.chapters.map((chapter) => t(`chapter.${chapter.id}.title`))
          )
        )}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'RigLog', url: origin },
          // A short label, not the meta title: a breadcrumb is a trail,
          // and Search renders it as one.
          { name: t('breadcrumb'), url: `${origin}/demo` },
        ])}
      />
      <PublicHeader />

      <section className="border-b border-surface-border bg-gradient-to-b from-brand-50 to-surface dark:from-brand-400/10">
        <div className="mx-auto max-w-5xl px-4 py-14 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight text-ink sm:text-5xl">
            {t('heroTitle')}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
            {t('heroBody', { count: featureCount })}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="btn-primary px-6 py-3 text-base">
              {t('ctaStart')}
            </Link>
            <Link href="/community" className="btn-secondary px-6 py-3 text-base">
              {t('ctaBrowse')}
            </Link>
          </div>
          <p className="mt-4 text-sm text-ink-faint">{t('heroNote')}</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12" aria-labelledby="explore-heading">
        <h2 id="explore-heading" className="sr-only">
          {t('explore')}
        </h2>
        <DemoExplorer previews={previews} featureBase={localizedHref('/demo')} />
      </section>

      {/*
        Every feature named in plain, always-visible text.

        The explorer keeps forty-one of its forty-two panels `hidden`,
        and while Search does index hidden tab content it does not weigh
        it the same as what is on the page. This list costs a reader
        nothing — it is the index of a long page, which is useful on its
        own — and it puts every feature name in the document unhidden,
        with an anchor that now opens that feature thanks to the
        explorer's hashchange handling.
      */}
      <section className="border-t border-surface-border bg-surface" aria-labelledby="all-features-heading">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h2 id="all-features-heading" className="text-2xl font-bold text-ink">
            {t('allFeatures')}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">{t('allFeaturesBody')}</p>
          <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {DEMO_SECTIONS.map((section) => (
              <div key={section.id}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  {t(`section.${section.id}.eyebrow`)}
                </h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {section.chapters.map((chapter) => (
                    <li key={chapter.id}>
                      {/* Each feature's own page (/demo/[feature]): a real
                          URL a crawler can rank, where the panel above is
                          a fragment of this one. */}
                      <Link
                        href={localizedHref(`/demo/${chapter.id}`)}
                        className="text-brand-600 hover:underline dark:text-brand-300"
                      >
                        {t(`chapter.${chapter.id}.title`)}
                      </Link>{' '}
                      <span className="text-xs text-ink-faint">
                        {t(TIER_LABEL_KEY[chapter.tier])}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/*
        The questions, as prose.

        Not `FAQPage` structured data: Google retired the FAQ rich result
        on 7 May 2026, so the markup would produce nothing in Search.
        These earn their place the ordinary way — somebody searching "is
        it free" or "îmi aduce aminte de ITP" is asking to be sold to, and
        this answers in the words they used.
      */}
      <section className="mx-auto max-w-3xl px-4 py-12" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-2xl font-bold text-ink sm:text-3xl">
          {t('faqTitle')}
        </h2>
        <dl className="mt-8 space-y-6">
          {DEMO_FAQ_IDS.map((id) => (
            <div key={id}>
              <dt className="font-semibold text-ink">
                {/* h3 as well as dt: the heading outline is how a reader
                    skimming with a screen reader moves between them. */}
                <h3 className="text-base font-semibold">{t(`faq.${id}.q`)}</h3>
              </dt>
              <dd className="mt-1.5 text-ink-muted">
                {t(`faq.${id}.a`, { price: formatPlanPrice(LADDER.PERSONAL.monthlyRon, locale) })}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-t border-surface-border bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold text-ink sm:text-3xl">{t('closingTitle')}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-ink-muted">
            {t('closingBody', { vehicles: FREE_TIER.vehicles, price: formatPlanPrice(LADDER.PERSONAL.monthlyRon, locale) })}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="btn-primary px-6 py-3 text-base">
              {t('ctaStart')}
            </Link>
            <Link href={localizedHref('/')} className="btn-secondary px-6 py-3 text-base">
              {t('ctaPricing')}
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
