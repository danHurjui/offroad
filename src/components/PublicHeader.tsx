import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { getTranslations } from 'next-intl/server'
import { authOptions } from '@/lib/auth'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import LanguageToggle from './LanguageToggle'

/**
 * Header for the logged-out marketing site (/, /donate, /tickets). Distinct
 * from Nav.tsx, which is the in-app header for the dashboard: this one
 * points at the public pages and adapts its final CTA to whether there's a
 * session, so a signed-in visitor landing on the homepage gets a route back
 * into the app instead of being asked to log in again.
 */
export default async function PublicHeader() {
  const t = await getTranslations('nav')
  const session = await getServerSession(authOptions)

  return (
    <header
      className="sticky top-0 z-20 border-b border-surface-border bg-surface/90 backdrop-blur"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-brand-600 dark:text-brand-300" aria-label={t('homeAria')}>
          <Logo />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <LanguageToggle compact />
          <ThemeToggle compact />
          <Link href="/tickets" className="text-ink-muted hover:text-ink">
            {t('roadmap')}
          </Link>
          <Link href="/donate" className="hidden text-ink-muted hover:text-ink sm:inline">
            {t('donate')}
          </Link>
          {session ? (
            <Link href="/dashboard" className="btn-primary">
              {t('dashboard')}
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-ink-muted hover:text-ink">
                {t('logIn')}
              </Link>
              <Link href="/register" className="btn-primary">
                {t('signUp')}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
