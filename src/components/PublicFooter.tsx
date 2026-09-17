import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function PublicFooter() {
  const t = await getTranslations('footer')

  return (
    <footer className="mt-16 border-t border-surface-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold text-ink">RigLog</div>
          <p className="text-ink-muted">{t('tagline')}</p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-ink-muted">
          <Link href="/community" className="hover:text-ink">
            {t('community')}
          </Link>
          <Link href="/tickets" className="hover:text-ink">
            {t('roadmap')}
          </Link>
          <Link href="/tickets/new" className="hover:text-ink">
            {t('reportBug')}
          </Link>
          <Link href="/donate" className="hover:text-ink">
            {t('donate')}
          </Link>
          <Link href="/login" className="hover:text-ink">
            {t('logIn')}
          </Link>
          <Link href="/terms" className="hover:text-ink">
            {t('terms')}
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            {t('privacy')}
          </Link>
          <Link href="/cookies" className="hover:text-ink">
            {t('cookies')}
          </Link>
        </nav>
      </div>
    </footer>
  )
}
