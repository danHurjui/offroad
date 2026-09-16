import Link from 'next/link'
import { requireAdminOrNotFound } from '@/lib/serverAuth'
import Logo from '@/components/Logo'
import ThemeToggle from '@/components/ThemeToggle'

/**
 * Every /admin page is gated here as well as in its own API routes. The
 * layout running first means a non-admin gets a 404 before any child page
 * queries anything.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminOrNotFound()

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-surface-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-brand-600 dark:text-brand-300" aria-label="RigLog admin">
              <Logo />
            </Link>
            <span className="text-lg font-semibold text-ink-muted">admin</span>
            <span className="badge badge-warn">staff</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-ink-muted hover:text-ink">
              Overview
            </Link>
            <Link href="/admin/users" className="text-ink-muted hover:text-ink">
              Users
            </Link>
            <Link href="/admin/tickets" className="text-ink-muted hover:text-ink">
              Tickets
            </Link>
            <Link href="/dashboard" className="btn-secondary">
              Back to app
            </Link>
            <ThemeToggle compact />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
