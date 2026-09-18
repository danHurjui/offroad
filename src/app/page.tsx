import Link from 'next/link'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PROJECT_TYPES } from '@/lib/projectType'
import { getAllVocabulary } from '@/lib/vocabulary'
import { PRO_PLANS } from '@/lib/stripe'
import { foundingMemberStatus } from '@/lib/foundingMembers'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('home')
  return { title: t('metaTitle'), description: t('metaDescription') }
}

/**
 * The feature cards, as catalogue keys rather than prose.
 *
 * The order is the layout; the words live in messages/*.json under
 * `home.feature.<key>`, so adding a card is one entry here and one block
 * per language — and i18n.test.ts fails if a language is missing one.
 */
const FEATURE_KEYS = ['costs', 'photos', 'documents', 'mechanic', 'receipts', 'privacy'] as const

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

  return (
    <div className="min-h-screen bg-background">
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
            <Link href="/demo" className="btn-secondary px-6 py-3 text-base">
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
            <div key={key} className="card p-5">
              <h3 className="mb-1.5 font-semibold text-ink">{t(`feature.${key}.title`)}</h3>
              <p className="text-sm text-ink-muted">{t(`feature.${key}.body`)}</p>
            </div>
          ))}
        </div>
        {/* These six are the summary. /demo is the same list at length,
            with a sample screen against each one. */}
        <div className="mt-6">
          <Link href="/demo" className="btn-secondary">
            {t('ctaDemo')}
          </Link>
        </div>
      </Section>

      {/* Pricing */}
      <Section eyebrow={t('pricingEyebrow')} title={t('pricingTitle')}>
        <div className="grid gap-5 sm:grid-cols-2">
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
            <h3 className="text-lg font-semibold text-ink">{t('pro')}</h3>
            <p className="mt-1 text-2xl font-bold text-ink">
              {t('proFrom', { price: PRO_PLANS.MONTHLY.priceRon })}
              <span className="text-base font-normal text-ink-muted">{t('perMonth')}</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-ink-muted">
              <li>{t('proVehicles')}</li>
              <li>{t('proAnalytics')}</li>
              <li>{t('proPdf')}</li>
              <li>{t('proCards')}</li>
              <li>{t('proExtras')}</li>
            </ul>
            <p className="mt-4 text-xs text-ink-faint">
              {t('proAlsoAvailable', {
                annual: PRO_PLANS.ANNUAL.priceRon,
                lifetime: PRO_PLANS.LIFETIME.priceRon,
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
            <Link href="/donate" className="btn-primary mt-4">
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
