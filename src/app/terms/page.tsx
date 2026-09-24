import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import LegalTranslationNote from '@/components/LegalTranslationNote'
import {
  ACCEPTABLE_USE,
  CONSUMER_AUTHORITY,
  EU_ODR_URL,
  LEGAL_LAST_UPDATED,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_CONTROLLER,
  WITHDRAWAL_PERIOD_DAYS,
} from '@/lib/legal'
import { FREE_TIER, FOUNDING_MEMBER_LIMIT } from '@/lib/pro'
import { formatPlanPrice, LADDER } from '@/lib/plans'
import { MAX_UPLOAD_BYTES } from '@/lib/storage'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legalPages.terms')
  return { title: t('metaTitle'), description: t('metaDescription') }
}

const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))

/**
 * A `t.rich` tag handler: it receives the chunks between `<tag>` and
 * `</tag>` in a catalogue message and wraps them. Named rather than a
 * bare arrow because ESLint reads an anonymous arrow returning JSX as an
 * undisplaynamed component, which this is not.
 */
function richLink(href: string) {
  return function LinkChunks(chunks: React.ReactNode) {
    return (
      <Link href={href} className="text-brand-600 dark:text-brand-300 hover:underline">
        {chunks}
      </Link>
    )
  }
}

/** The same, for an outbound link; `text` overrides the chunks when the
 * label is a proper noun that belongs in the code rather than the
 * catalogue (the consumer authority's name). */
function richExternal(href: string, text?: string) {
  return function ExternalChunks(chunks: React.ReactNode) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-brand-600 dark:text-brand-300 hover:underline"
      >
        {text ?? chunks}
      </a>
    )
  }
}

function bold(chunks: React.ReactNode) {
  return <strong className="text-ink">{chunks}</strong>
}

/**
 * Readable with no session, like /privacy and /cookies, and built the same
 * way: the numbers come from the code that enforces them (FREE_TIER,
 * LADDER, MAX_UPLOAD_BYTES, WITHDRAWAL_PERIOD_DAYS) rather than being
 * retyped, so the terms cannot promise one thing while the app does
 * another. Interpolating them into the catalogue's sentences keeps that
 * true in both languages.
 */
export default async function TermsPage() {
  const t = await getTranslations('legalPages.terms')
  const tp = await getTranslations('legalPages')
  const tl = await getTranslations('legal')
  const locale = await getLocale()
  const price = (ron: number) => formatPlanPrice(ron, locale)

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-2 text-3xl font-bold text-ink">{t('title')}</h1>
        <p className="mb-6 text-sm text-ink-faint">
          {tp('lastUpdated', { date: LEGAL_LAST_UPDATED })}
        </p>

        <LegalTranslationNote />

        <Section title={t('shortHeading')}>
          <p>{t('short1')}</p>
          <p>{t('short2')}</p>
        </Section>

        <Section title={t('partiesHeading')}>
          <p>{t('parties', { operator: PRIVACY_CONTROLLER ?? t('operatorFallback') })}</p>
          <p>
            {PRIVACY_CONTACT_EMAIL
              ? t.rich('reachUsEmail', {
                  email: () => (
                    <a
                      href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
                      className="text-brand-600 dark:text-brand-300 hover:underline"
                    >
                      {PRIVACY_CONTACT_EMAIL}
                    </a>
                  ),
                })
              : t.rich('reachUsTickets', { tickets: richLink('/tickets/new') })}
          </p>
        </Section>

        <Section title={t('accountHeading')}>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>{t('accountAge')}</li>
            <li>{t('accountEmail')}</li>
            <li>{t('accountPassword')}</li>
            <li>{t('accountOnePerPerson')}</li>
          </ul>
        </Section>

        <Section title={t('getHeading')}>
          <p>
            <strong className="text-ink">{t('freeTerm')}</strong>{' '}
            {t('free', { vehicles: FREE_TIER.vehicles, photos: FREE_TIER.photosPerTask })}
          </p>
          <p>
            <strong className="text-ink">{t('proTerm')}</strong>{' '}
            {t('pro', {
              vehicles: LADDER.PERSONAL.vehicles,
              monthly: price(LADDER.PERSONAL.monthlyRon),
              annual: price(LADDER.PERSONAL.annualRon),
              lifetime: price(LADDER.PERSONAL.lifetimeRon ?? 0),
            })}
          </p>
          <p>
            <strong className="text-ink">{t('companyTerm')}</strong>{' '}
            {t('company', {
              pro: price(LADDER.PRO.monthlyRon),
              proVehicles: LADDER.PRO.vehicles,
              business: price(LADDER.BUSINESS.monthlyRon),
              businessVehicles: LADDER.BUSINESS.vehicles,
              fleet: price(LADDER.FLEET.monthlyRon),
              fleetVehicles: LADDER.FLEET.vehicles,
            })}
          </p>
          <p>{t('grandfathered')}</p>
          <p>{t('uploadCap', { mb: MAX_UPLOAD_MB })}</p>
          <p>{t('tierChanges')}</p>
        </Section>

        <Section title={t('payingHeading')}>
          <p>{t('paying1')}</p>
          <p>{t.rich('paying2', { settings: richLink('/dashboard/settings') })}</p>
          <p>{t.rich('withdrawal', { b: bold, days: WITHDRAWAL_PERIOD_DAYS })}</p>
          <p>{t('afterWithdrawal', { days: WITHDRAWAL_PERIOD_DAYS })}</p>
          <p>{t('losingPro')}</p>
        </Section>

        <Section title={t('foundingHeading')}>
          <p>{t('founding1', { limit: FOUNDING_MEMBER_LIMIT })}</p>
          <p>{t('founding2')}</p>
          <p>{t.rich('founding3', { b: bold })}</p>
        </Section>

        <Section title={t('donationsHeading')}>
          <p>{t('donations')}</p>
        </Section>

        <Section title={t('contentHeading')}>
          <p>{t('content1')}</p>
          <p>{t('content2')}</p>
          <p>{t.rich('content3', { b: bold })}</p>
        </Section>

        <Section title={t('mustNotHeading')}>
          <p>{t('mustNotIntro')}</p>
          <ul className="mt-2 space-y-3">
            {ACCEPTABLE_USE.map((entry) => (
              <li key={entry.id} className="card p-4">
                <p className="text-sm font-medium text-ink">{tl(`acceptableUse.${entry.id}.rule`)}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {tl(`acceptableUse.${entry.id}.because`)}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t('collaboratorsHeading')}>
          <p>{t('collaborators1')}</p>
          <p>{t('collaborators2')}</p>
        </Section>

        <Section title={t('promiseHeading')}>
          <p>{t('promise1')}</p>
          <p>{t('promise2')}</p>
          <p>{t('promise3')}</p>
        </Section>

        <Section title={t('liabilityHeading')}>
          <p>{t('liability1')}</p>
          <p>{t('liability2')}</p>
        </Section>

        <Section title={t('endingHeading')}>
          <p>
            <strong className="text-ink">{t('endingYouTerm')}</strong> {t('endingYou')}
          </p>
          <p>
            <strong className="text-ink">{t('endingUsTerm')}</strong> {t('endingUs')}
          </p>
        </Section>

        <Section title={t('changesHeading')}>
          <p>{t.rich('changes', { tickets: richLink('/tickets') })}</p>
        </Section>

        <Section title={t('lawHeading')}>
          <p>{t('law1')}</p>
          <p>
            {t.rich('law2', {
              authority: richExternal(CONSUMER_AUTHORITY.url, CONSUMER_AUTHORITY.name),
              odr: richExternal(EU_ODR_URL),
            })}
          </p>
          <p>{t.rich('law3', { privacy: richLink('/privacy') })}</p>
        </Section>
      </main>
      <PublicFooter />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xl font-bold text-ink">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-ink-muted">{children}</div>
    </section>
  )
}
