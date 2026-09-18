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
      select: { displayName: true, avatarUrl: true },
    })
    return (
      <Nav
        userId={session.user.id}
        displayName={user?.displayName ?? t('dashboard')}
        avatarUrl={user?.avatarUrl}
        isAdmin={session.user.isAdmin}
      />
    )
  }

  return (
    <header
      className="sticky top-0 z-20 border-b border-surface-border bg-surface/90 backdrop-blur"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* Both rows wrap. The logged-out bar carries five controls and the
          Romanian labels are long enough ("Plan de dezvoltare",
          "Autentificare") that they ran past the right edge of a phone and
          scrolled the whole page sideways — the tour link made a bar that
          was already a little too wide clearly too wide. Wrapping costs a
          second line on the narrowest screens and nothing anywhere else. */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="text-brand-600 dark:text-brand-300" aria-label={t('homeAria')}>
          <Logo />
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 text-sm sm:gap-x-4">
          <LanguageToggle compact />
          <ThemeToggle compact />
          {/* The tour is the page a first-time visitor wants, so it keeps
              its place at every width; the roadmap steps aside on a phone
              alongside donate, where there is room for one of the three. */}
          <Link href="/demo" className="text-ink-muted hover:text-ink">
            {t('demo')}
          </Link>
          <Link href="/tickets" className="hidden text-ink-muted hover:text-ink sm:inline">
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
