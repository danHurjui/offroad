import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { requireAdminOrNotFound } from '@/lib/serverAuth'
import Logo from '@/components/Logo'
import ThemeToggle from '@/components/ThemeToggle'
import LanguageToggle from '@/components/LanguageToggle'

/**
 * Every /admin page is gated here as well as in its own API routes. The
 * layout running first means a non-admin gets a 404 before any child page
 * queries anything.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('admin')
  await requireAdminOrNotFound()

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-surface-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-brand-600 dark:text-brand-300" aria-label={t('aria')}>
              <Logo />
            </Link>
            <span className="text-lg font-semibold text-ink-muted">{t('label')}</span>
            <span className="badge badge-warn">{t('staff')}</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-ink-muted hover:text-ink">
              {t('overview')}
            </Link>
            <Link href="/admin/users" className="text-ink-muted hover:text-ink">
              {t('users')}
            </Link>
            <Link href="/admin/tickets" className="text-ink-muted hover:text-ink">
              {t('tickets')}
            </Link>
            <Link href="/dashboard" className="btn-secondary">
              {t('backToApp')}
            </Link>
            <LanguageToggle compact />
            <ThemeToggle compact />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
