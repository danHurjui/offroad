import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * Header for the logged-out marketing site (/, /donate, /tickets). Distinct
 * from Nav.tsx, which is the in-app header for the dashboard: this one
 * points at the public pages and adapts its final CTA to whether there's a
 * session, so a signed-in visitor landing on the homepage gets a route back
 * into the app instead of being asked to log in again.
 */
export default async function PublicHeader() {
  const session = await getServerSession(authOptions)

  return (
    <header
      className="sticky top-0 z-20 border-b border-surface-border bg-surface/90 backdrop-blur"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-brand-600">
          RigLog
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/tickets" className="text-ink-muted hover:text-ink">
            Roadmap
          </Link>
          <Link href="/donate" className="hidden text-ink-muted hover:text-ink sm:inline">
            Donate
          </Link>
          {session ? (
            <Link href="/dashboard" className="btn-primary">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-ink-muted hover:text-ink">
                Log in
              </Link>
              <Link href="/register" className="btn-primary">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
