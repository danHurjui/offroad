import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import LegalTranslationNote from '@/components/LegalTranslationNote'
import {
  LEGAL_LAST_UPDATED,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_CONTROLLER,
  RETENTION,
  SUB_PROCESSORS,
} from '@/lib/legal'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legalPages.privacy')
  return { title: t('metaTitle'), description: t('metaDescription') }
}

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

/**
 * Readable with no session, like the homepage and the feedback board.
 * Everything factual comes from src/lib/legal.ts, which is written from
 * what the code does — a policy that contradicts the implementation is
 * worse than none. The sentences describing those facts live in the
 * catalogue so both languages say the same thing; legal.test.ts checks
 * that neither is missing one.
 */
export default async function PrivacyPage() {
  const t = await getTranslations('legalPages.privacy')
  const tp = await getTranslations('legalPages')
  const tl = await getTranslations('legal')

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-2 text-3xl font-bold text-ink">{t('title')}</h1>
        <p className="mb-6 text-sm text-ink-faint">
          {tp('lastUpdated', { date: LEGAL_LAST_UPDATED })}
        </p>

        <LegalTranslationNote />

        <Section title={t('shortVersion')}>
          <p>{t('shortBody')}</p>
          <p>{t.rich('shortRights', { settings: richLink('/dashboard/settings') })}</p>
        </Section>

        <Section title={t('whoHeading')}>
          <p>
            {t('controllerLine', {
              controller: PRIVACY_CONTROLLER ?? t('controllerFallback'),
            })}
          </p>
          <p>
            {PRIVACY_CONTACT_EMAIL
              ? t.rich('contactWithEmail', {
                  email: () => (
                    <a
                      href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
                      className="text-brand-600 dark:text-brand-300 hover:underline"
                    >
                      {PRIVACY_CONTACT_EMAIL}
                    </a>
                  ),
                })
              : t.rich('contactNoEmail', { tickets: richLink('/tickets/new') })}
          </p>
        </Section>

        <Section title={t('collectHeading')}>
          <Definition term={t('collectAccountTerm')}>{t('collectAccount')}</Definition>
          <Definition term={t('collectLoggedTerm')}>{t('collectLogged')}</Definition>
          <Definition term={t('collectPublicTerm')}>{t('collectPublic')}</Definition>
          <Definition term={t('collectLogsTerm')}>{t('collectLogs')}</Definition>
          <p>{t('noSpecialCategory')}</p>
        </Section>

        <Section title={t('basisHeading')}>
          <ul className="list-disc space-y-1.5 pl-5">
            <Basis term={t('basisContractTerm')}>{t('basisContract')}</Basis>
            <Basis term={t('basisInterestsTerm')}>{t('basisInterests')}</Basis>
            <Basis term={t('basisConsentTerm')}>{t('basisConsent')}</Basis>
            <Basis term={t('basisLegalTerm')}>{t('basisLegal')}</Basis>
          </ul>
        </Section>

        <Section title={t('sharingHeading')}>
          <p>{t('sharingIntro')}</p>
          <div className="mt-4 space-y-4">
            {SUB_PROCESSORS.map((processor) => (
              <div key={processor.id} className="card p-4">
                <h3 className="font-semibold text-ink">{tl(`subProcessor.${processor.id}.name`)}</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {tl(`subProcessor.${processor.id}.purpose`)}
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  <span className="font-medium text-ink">{t('whatTheyReceive')}</span>
                  {tl(`subProcessor.${processor.id}.dataShared`)}
                </p>
                {/* Only the conditional entries have a `when` to show. */}
                {processor.conditional && (
                  <p className="mt-1 text-xs text-ink-faint">
                    {tl(`subProcessor.${processor.id}.when`)}
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-4">{t('transfers')}</p>
          <p>{t('compelled')}</p>
        </Section>

        <Section title={t('collaboratorsHeading')}>
          <p>{t('collaborators')}</p>
        </Section>

        <Section title={t('retentionHeading')}>
          <div className="mt-2 space-y-3">
            {RETENTION.map((entry) => (
              <div key={entry.id} className="card p-4">
                <h3 className="text-sm font-semibold text-ink">{tl(`retention.${entry.id}.what`)}</h3>
                <p className="mt-1 text-sm text-ink-muted">{tl(`retention.${entry.id}.howLong`)}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title={t('rightsHeading')}>
          <p>{t('rightsIntro')}</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <Basis term={t('rightAccessTerm')}>
              {t.rich('rightAccess', { em: (chunks) => <em>{chunks}</em> })}
            </Basis>
            <Basis term={t('rightRectifyTerm')}>{t('rightRectify')}</Basis>
            <Basis term={t('rightEraseTerm')}>
              {t.rich('rightErase', { em: (chunks) => <em>{chunks}</em> })}
            </Basis>
            <Basis term={t('rightPortTerm')}>{t('rightPort')}</Basis>
            <Basis term={t('rightObjectTerm')}>{t('rightObject')}</Basis>
            <Basis term={t('rightComplainTerm')}>
              {t.rich('rightComplain', {
                anspdcp: (chunks) => (
                  <a
                    href="https://www.dataprotection.ro"
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 dark:text-brand-300 hover:underline"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </Basis>
          </ul>
          <p>{t('rightsButtons')}</p>
        </Section>

        <Section title={t('cookiesHeading')}>
          <p>{t.rich('cookies', { list: richLink('/cookies') })}</p>
        </Section>

        <Section title={t('childrenHeading')}>
          <p>{t('children')}</p>
        </Section>

        <Section title={t('changesHeading')}>
          <p>{t.rich('changes', { tickets: richLink('/tickets') })}</p>
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

function Definition({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <p>
      <strong className="text-ink">{term}. </strong>
      {children}
    </p>
  )
}

/** A bolded lead-in, then the explanation — used for both lists above. */
function Basis({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <li>
      <strong className="text-ink">{term}</strong> — {children}
    </li>
  )
}
