import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import AppVersion from './AppVersion'
import { localizedHref } from '@/i18n/localizedHref'

export default async function PublicFooter() {
  const t = await getTranslations('footer')

  return (
    <footer className="mt-16 border-t border-surface-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold text-ink">RigLog</div>
          <p className="text-ink-muted">{t('tagline')}</p>
          {/* Small and out of the way, but on every public page: it is
              the first thing worth knowing about a report that says
              "this button does nothing". */}
          <AppVersion className="mt-1 -ml-1 block" />
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-ink-muted">
          <Link href={localizedHref('/demo')} className="hover:text-ink">
            {t('demo')}
          </Link>
          <Link href="/community" className="hover:text-ink">
            {t('community')}
          </Link>
          <Link href="/tickets" className="hover:text-ink">
            {t('roadmap')}
          </Link>
          <Link href="/tickets/new" className="hover:text-ink">
            {t('reportBug')}
          </Link>
          <Link href={localizedHref('/donate')} className="hover:text-ink">
            {t('donate')}
          </Link>
          <Link href="/login" className="hover:text-ink">
            {t('logIn')}
          </Link>
          <Link href={localizedHref('/terms')} className="hover:text-ink">
            {t('terms')}
          </Link>
          <Link href={localizedHref('/privacy')} className="hover:text-ink">
            {t('privacy')}
          </Link>
          <Link href={localizedHref('/cookies')} className="hover:text-ink">
            {t('cookies')}
          </Link>
          <Link href={localizedHref('/sitemap')} className="hover:text-ink">
            {t('sitemap')}
          </Link>
        </nav>
      </div>
    </footer>
  )
}
