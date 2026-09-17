import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import LegalTranslationNote from '@/components/LegalTranslationNote'
import { COOKIES, LEGAL_LAST_UPDATED, LOCAL_STORAGE_ENTRIES } from '@/lib/legal'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legalPages.cookies')
  return { title: t('metaTitle'), description: t('metaDescription') }
}

export default async function CookiesPage() {
  const t = await getTranslations('legalPages.cookies')
  const tp = await getTranslations('legalPages')
  const tl = await getTranslations('legal')
  const allStrictlyNecessary = COOKIES.every((c) => c.strictlyNecessary)

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-2 text-3xl font-bold text-ink">{t('title')}</h1>
        <p className="mb-6 text-sm text-ink-faint">
          {tp('lastUpdated', { date: LEGAL_LAST_UPDATED })}
        </p>

        <LegalTranslationNote />

        <section className="mb-10 space-y-3 text-sm leading-relaxed text-ink-muted">
          <h2 className="mb-3 text-xl font-bold text-ink">{t('whyNoBannerHeading')}</h2>
          <p>{t('whyNoBanner', { count: COOKIES.length })}</p>
          <p>{t('exemption')}</p>
          {!allStrictlyNecessary && (
            // Rendered from the data, so this can't be forgotten: adding a
            // non-essential cookie to the list makes this warning appear.
            <p className="card note-warn p-3 text-sm text-ink">{t('warning')}</p>
          )}
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-xl font-bold text-ink">{t('theCookies')}</h2>
          <div className="space-y-4">
            {COOKIES.map((cookie) => (
              <div key={cookie.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {/* The cookie's own name is technical, not prose — a
                      reader checking devtools has to find this string. */}
                  <code className="break-all font-mono text-sm text-ink">{cookie.name}</code>
                  {cookie.strictlyNecessary && (
                    <span className="badge badge-neutral">{t('essential')}</span>
                  )}
                </div>
                <p className="mt-2 text-sm text-ink-muted">{tl(`cookie.${cookie.id}.purpose`)}</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {t('lasts', { duration: tl(`cookie.${cookie.id}.duration`) })}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-xl font-bold text-ink">{t('storageHeading')}</h2>
          <p className="mb-4 text-sm leading-relaxed text-ink-muted">{t('storageIntro')}</p>
          <div className="space-y-4">
            {LOCAL_STORAGE_ENTRIES.map((entry) => (
              <div key={entry.id} className="card p-4">
                <code className="font-mono text-sm text-ink">{entry.name}</code>
                <p className="mt-2 text-sm text-ink-muted">{tl(`storage.${entry.id}.purpose`)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10 space-y-3 text-sm leading-relaxed text-ink-muted">
          <h2 className="mb-3 text-xl font-bold text-ink">{t('turningOffHeading')}</h2>
          <p>{t.rich('turningOff', { em: (chunks) => <em>{chunks}</em> })}</p>
          <p>
            {t.rich('publicPages', {
              home: (chunks) => (
                <Link href="/" className="text-brand-600 dark:text-brand-300 hover:underline">
                  {chunks}
                </Link>
              ),
              tickets: (chunks) => (
                <Link href="/tickets" className="text-brand-600 dark:text-brand-300 hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
          <p>
            {t.rich('morePrivacy', {
              privacy: (chunks) => (
                <Link href="/privacy" className="text-brand-600 dark:text-brand-300 hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}
