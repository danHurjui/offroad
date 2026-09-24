import Link from 'next/link'
import type { Metadata } from 'next'
import { publicPageMetadata } from '@/lib/pageMetadata'
import { getLocale, getTranslations } from 'next-intl/server'
import { PROJECT_TYPES } from '@/lib/projectType'
import { getAllVocabulary } from '@/lib/vocabulary'
import { formatPlanPrice, LADDER } from '@/lib/plans'
import { foundingMemberStatus } from '@/lib/foundingMembers'
import { appUrlForMetadata } from '@/lib/appUrl'
import { DEMO_SECTIONS } from '@/lib/demoTour'
import { softwareApplicationJsonLd, webSiteJsonLd } from '@/lib/structuredData'
import JsonLd from '@/components/JsonLd'
import CompanyPlans from '@/components/CompanyPlans'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import { FEATURE_KEYS, HOME_FEATURE_CHAPTER } from '@/lib/demoTour'
import DemoScreen from '@/components/demo/DemoScreen'
import { HealthPreview, ReceiptScanPreview } from '@/components/demo/recordPreviews'
import { FleetBoardPreview } from '@/components/demo/fleetPreviews'
import { localizedHref } from '@/i18n/localizedHref'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('home')
  return await publicPageMetadata({
    path: '/',
    title: t('metaTitle'),
    description: t('metaDescription'),
  })
}


/** The fleet section's points, in order (`home.businessPoint.<key>`). */
const BUSINESS_POINTS = ['compliance', 'drivers', 'trips', 'reports'] as const

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-14">
      {eyebrow && (
        <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">{eyebrow}</div>
      )}
      <h2 className="mb-8 text-2xl font-bold text-ink sm:text-3xl">{title}</h2>
      {children}
    </section>
  )
}

export default async function Home() {
  // Already a dynamic page (PublicHeader reads the session), so the live
  // count costs nothing extra in rendering mode. It can be a few seconds
  // stale by the time it reaches a browser, which is fine — it is a
  // marketing number, and the grant itself is decided atomically at signup.
  const t = await getTranslations('home')
  const founding = await foundingMemberStatus()
  // The three-modes section maps over PROJECT_TYPES synchronously inside
  // JSX, so the labels have to be in hand before the render starts.
  const vocabulary = await getAllVocabulary()
  const locale = await getLocale()
  const origin = appUrlForMetadata()
  // The feature list is the tour's, named in the reader's language — the
  // same set the /demo page advertises, under the same `@id`, so the two
  // pages describe one product rather than two.
  const td = await getTranslations('demo')
  const site = {
    url: origin,
    name: 'RigLog',
    description: t('metaDescription'),
    inLanguage: locale,
  }

  return (
    <div className="min-h-screen bg-background">
      <JsonLd data={webSiteJsonLd(site)} />
      <JsonLd
        data={softwareApplicationJsonLd(
          site,
          DEMO_SECTIONS.flatMap((section) =>
            section.chapters.map((chapter) => td(`chapter.${chapter.id}.title`))
          )
        )}
      />
      <PublicHeader />

      {/* Hero */}
      <section className="border-b border-surface-border bg-gradient-to-b from-brand-50 to-surface">
        <div className="mx-auto max-w-5xl px-4 py-20 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight text-ink sm:text-5xl">
            {t('heroTitle')}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
            {t('heroBody')}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="btn-primary px-6 py-3 text-base">
              {t('ctaStart')}
            </Link>
            <Link href={localizedHref('/demo')} className="btn-secondary px-6 py-3 text-base">
              {t('ctaDemo')}
            </Link>
            <Link href="/community" className="btn-secondary px-6 py-3 text-base">
              {t('ctaBrowse')}
            </Link>
          </div>
          <p className="mt-4 text-sm text-ink-faint">
            {t('noCard')}
          </p>

          {/* Only while there are slots. An expired offer left on a landing
              page is worse than never running one. */}
          {founding.open && (
            <p className="mx-auto mt-6 inline-flex flex-wrap items-center justify-center gap-x-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm dark:border-brand-400/30 dark:bg-brand-400/10">
              <span className="font-semibold text-ink">{t('foundingHeadline')}</span>
              {/* Pluralised in the catalogue: Romanian's rule for "place"
                  is not English's, so this cannot be a ternary. */}
              <span className="text-ink-muted">
                {t('foundingRemaining', { remaining: founding.remaining, limit: founding.limit })}
              </span>
            </p>
          )}
        </div>
      </section>

      {/* Three modes */}
      <Section eyebrow={t('modesEyebrow')} title={t('modesTitle')}>
        <div className="grid gap-5 sm:grid-cols-3">
          {PROJECT_TYPES.map((type) => {
            const config = vocabulary[type]
            const headline = t(`mode.${type}.headline`)
            const body = t(`mode.${type}.body`)
            return (
              <div key={type} className="card flex flex-col p-6">
                <span className="badge mb-3 self-start badge-brand">{config.label}</span>
                <h3 className="mb-2 text-lg font-semibold text-ink">{headline}</h3>
                <p className="text-sm text-ink-muted">{body}</p>
                <div className="mt-4 border-t border-surface-border pt-4 text-xs text-ink-faint">
                  {t('tracks')} {config.categories.slice(0, 4).map((c) => c.label).join(' · ')}
                  {config.categories.length > 4
                    ? t('tracksMore', { count: config.categories.length - 4 })
                    : ''}
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* Features */}
      <Section eyebrow={t('featuresEyebrow')} title={t('featuresTitle')}>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_KEYS.map((key) => (
            <Link key={key} href={localizedHref(`/demo/${HOME_FEATURE_CHAPTER[key]}`)} className="card block p-5 transition-colors hover:border-brand-400">
              <h3 className="mb-1.5 font-semibold text-ink">{t(`feature.${key}.title`)}</h3>
              <p className="text-sm text-ink-muted">{t(`feature.${key}.body`)}</p>
            </Link>
          ))}
        </div>
        {/* These nine are the summary. /demo is the same list at length,
            with a sample screen against each one. */}
        <div className="mt-6">
          <Link href={localizedHref('/demo')} className="btn-secondary">
            {t('ctaDemo')}
          </Link>
        </div>
      </Section>

      {/*
        The whole car, shown rather than listed: two of the tour's own
        sample screens, in the same frame and with the same "sample data"
        caption they carry on /demo — so the homepage cannot show a mock
        the tour does not also label.
      */}
      <Section eyebrow={t('recordsEyebrow')} title={t('recordsTitle')}>
        <p className="-mt-4 mb-8 max-w-2xl text-ink-muted">{t('recordsBody')}</p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
          <DemoScreen label={td('chapter.health.title')}>
            <HealthPreview />
          </DemoScreen>
          <DemoScreen label={td('chapter.receiptScan.title')}>
            <ReceiptScanPreview />
          </DemoScreen>
        </div>
        <div className="mt-6">
          <Link href="/demo#records" className="btn-secondary">
            {t('recordsCta')}
          </Link>
        </div>
      </Section>

      {/* For companies — the fleet half, before the pricing that sells it.
          The board gets the full width: it is a vehicles × documents grid,
          and squeezed into half a column it scrolls sideways. */}
      <section className="border-y border-surface-border bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-14">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">
                {t('businessEyebrow')}
              </div>
              <h2 className="text-2xl font-bold text-ink sm:text-3xl">{t('businessTitle')}</h2>
              <p className="mt-3 text-ink-muted">{t('businessBody')}</p>
              <Link href="/demo#business" className="btn-secondary mt-6">
                {t('businessCta')}
              </Link>
            </div>
            <ul className="space-y-2.5 self-center text-sm text-ink">
              {BUSINESS_POINTS.map((key) => (
                <li key={key} className="flex gap-2">
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" fill="currentColor">
                    <path d="M8.1 13.6 4.5 10l-1.4 1.4 5 5 9-9-1.4-1.4z" />
                  </svg>
                  {t(`businessPoint.${key}`)}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-10">
            <DemoScreen label={td('chapter.fleetBoard.title')}>
              <FleetBoardPreview />
            </DemoScreen>
          </div>
        </div>
      </section>

      {/* Pricing — every figure from the ladder (src/lib/plans.ts) */}
      <Section eyebrow={t('pricingEyebrow')} title={t('pricingTitle')}>
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-ink">{t('free')}</h3>
            <p className="mt-1 text-2xl font-bold text-ink">{t('freePrice')}</p>
            <ul className="mt-4 space-y-2 text-sm text-ink-muted">
              <li>{t('freeOneVehicle')}</li>
              <li>{t('freeUnlimited')}</li>
              <li>{t('freeReminders')}</li>
              <li>{t('freeTotalSpent')}</li>
              <li>{t('freeReports')}</li>
            </ul>
            <Link href="/register" className="btn-secondary mt-6 w-full">
              {t('createAccount')}
            </Link>
          </div>
          <div className="card border-brand-200 p-6">
            <h3 className="text-lg font-semibold text-ink">{t('personal')}</h3>
            <p className="mt-1 text-2xl font-bold text-ink">
              {t('personalFrom', { price: formatPlanPrice(LADDER.PERSONAL.monthlyRon, locale) })}
              <span className="text-base font-normal text-ink-muted">{t('perMonth')}</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-ink-muted">
              <li>{t('personalVehicles', { count: LADDER.PERSONAL.vehicles })}</li>
              <li>{t('proAnalytics')}</li>
              <li>{t('proPdf')}</li>
              <li>{t('proCards')}</li>
              <li>{t('proExtras')}</li>
            </ul>
            <p className="mt-4 text-xs text-ink-faint">
              {t('personalAlsoAvailable', {
                annual: formatPlanPrice(LADDER.PERSONAL.annualRon, locale),
                lifetime: formatPlanPrice(LADDER.PERSONAL.lifetimeRon ?? 0, locale),
              })}
              {founding.open && (
                <>
                  {' '}
                  {t('proFoundingNote', { limit: founding.limit, remaining: founding.remaining })}
                </>
              )}
            </p>
            <Link href="/register" className="btn-primary mt-4 w-full">
              {t('startFree')}
            </Link>
          </div>
          <CompanyPlans />
        </div>
      </Section>

      {/* Community / feedback / donate */}
      <Section eyebrow={t('communityEyebrow')} title={t('communityTitle')}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="card p-6">
            <h3 className="mb-1.5 font-semibold text-ink">{t('roadmapTitle')}</h3>
            <p className="text-sm text-ink-muted">
              {t('roadmapBody')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/tickets" className="btn-secondary">
                {t('seeRoadmap')}
              </Link>
              <Link href="/tickets/new" className="btn-secondary">
                {t('openTicket')}
              </Link>
            </div>
          </div>
          <div className="card p-6">
            <h3 className="mb-1.5 font-semibold text-ink">{t('supportTitle')}</h3>
            <p className="text-sm text-ink-muted">
              {t('supportBody')}
            </p>
            <Link href={localizedHref('/donate')} className="btn-primary mt-4">
              {t('donate')}
            </Link>
          </div>
        </div>
      </Section>

      {/* Closing CTA */}
      <section className="border-t border-surface-border bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold text-ink sm:text-3xl">{t('closingTitle')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            {t('closingBody')}
          </p>
          <Link href="/register" className="btn-primary mt-6 px-6 py-3 text-base">
            {t('closingCta')}
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
