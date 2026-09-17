import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { getTranslations } from 'next-intl/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Nav from './Nav'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import LanguageToggle from './LanguageToggle'

/**
 * Header for the logged-out marketing site (/, /donate, /tickets).
 *
 * For a signed-in visitor it hands over to Nav.tsx, the in-app header,
 * rather than swapping only its final CTA. The app nav offers Community
 * and Feedback as sections, and those pages are public ones — so following
 * either link used to replace the whole header with this marketing bar and
 * drop the reader out of the app they were in. One session, one header.
 *
 * Signed out, nothing changes: this is still the marketing chrome, with
 * log in and sign up.
 */
export default async function PublicHeader() {
  const t = await getTranslations('nav')
  const session = await getServerSession(authOptions)

  if (session?.user) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { displayName: true },
    })
    return <Nav displayName={user?.displayName ?? t('dashboard')} isAdmin={session.user.isAdmin} />
  }

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
          {/* No signed-in branch here any more: that case returned above. */}
          <Link href="/login" className="text-ink-muted hover:text-ink">
            {t('logIn')}
          </Link>
          <Link href="/register" className="btn-primary">
            {t('signUp')}
          </Link>
        </nav>
      </div>
    </header>
  )
}
