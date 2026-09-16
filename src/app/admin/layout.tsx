import Link from 'next/link'
import { requireAdminOrNotFound } from '@/lib/serverAuth'

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
            <Link href="/admin" className="text-lg font-bold text-brand-600">
              RigLog admin
            </Link>
            <span className="badge bg-amber-100 text-amber-800">staff</span>
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
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
