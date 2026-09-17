'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { signOut } from 'next-auth/react'
import { isActiveNavLink } from '@/lib/navLinks'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import LanguageToggle from './LanguageToggle'
import QuickAddButton from './QuickAddButton'
import ShortcutHelpButton from './ShortcutHelpButton'
import InstallAppButton from './InstallAppButton'

/**
 * The in-app header.
 *
 * Sections are a real nav with the current one marked; account and tools
 * are a separate cluster so "Log out" stops sitting at the same visual
 * rank as "Community".
 *
 * On a phone the sections were a horizontally scrollable strip. That fit,
 * but it put Settings and Log out past the right edge with nothing saying
 * they were there — a scroll affordance nobody looks for. They live in a
 * menu now, which also gives the install-as-an-app offer somewhere to be
 * on the device where installing actually matters.
 */
export default function Nav({
  userId,
  displayName,
  avatarUrl,
  isAdmin,
}: {
  userId: string
  displayName: string
  avatarUrl?: string | null
  isAdmin?: boolean
}) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  // Following a link inside the menu navigates without unmounting the
  // header, so nothing else would close it.
  useEffect(() => setMenuOpen(false), [pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const sections = [
    { href: '/dashboard', label: t('garage') },
    { href: '/community', label: t('community') },
    { href: '/tickets', label: t('feedback') },
    { href: '/donate', label: t('donate') },
    ...(isAdmin ? [{ href: '/admin', label: t('admin'), admin: true }] : []),
  ]

  const linkClass = (href: string, admin?: boolean) => {
    const active = isActiveNavLink(pathname, href)
    const base = 'whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition-colors'
    if (active) return `${base} bg-surface-subtle font-medium text-ink`
    const idle = admin
      ? 'text-amber-700 hover:bg-surface-subtle hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200'
      : 'text-ink-muted hover:bg-surface-subtle hover:text-ink'
    return `${base} ${idle}`
  }

  const settingsActive = pathname === '/dashboard/settings'

  return (
    <header
      className="sticky top-0 z-10 border-b border-surface-border bg-surface/90 backdrop-blur"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link
          href="/dashboard"
          className="shrink-0 text-brand-600 dark:text-brand-300"
          aria-label={t('dashboardAria')}
        >
          <Logo />
        </Link>

        <nav aria-label={t('sections')} className="hidden items-center gap-1 sm:flex">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              aria-current={isActiveNavLink(pathname, section.href) ? 'page' : undefined}
              className={linkClass(section.href, section.admin)}
            >
              {section.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <QuickAddButton />
          <ShortcutHelpButton />
          <LanguageToggle compact />
          <ThemeToggle compact />
          <span aria-hidden className="mx-1 hidden h-5 w-px bg-surface-border sm:block" />
          <Link
            href="/dashboard/settings"
            aria-label={t('accountAria')}
            aria-current={settingsActive ? 'page' : undefined}
            className={`hidden max-w-[12rem] items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors sm:flex ${
              settingsActive
                ? 'bg-surface-subtle font-medium text-ink'
                : 'text-ink-muted hover:bg-surface-subtle hover:text-ink'
            }`}
          >
            {avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/avatars/${userId}`}
                alt=""
                className="h-6 w-6 shrink-0 rounded-full object-cover"
              />
            )}
            <span className="truncate">{displayName}</span>
          </Link>
          <button
            type="button"
            className="hidden whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink sm:block"
            onClick={() => signOut({ callbackUrl: '/' })}
          >
            {t('logOut')}
          </button>

          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink sm:hidden"
            aria-label={menuOpen ? t('closeMenu') : t('openMenu')}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden className="text-lg leading-none">{menuOpen ? '✕' : '☰'}</span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav
          id="mobile-menu"
          aria-label={t('menu')}
          // Capped and scrollable rather than allowed to grow: on a short
          // phone in landscape the list is taller than the viewport, and a
          // menu you cannot reach the bottom of is worse than the strip
          // this replaced.
          className="max-h-[70vh] overflow-y-auto border-t border-surface-border px-4 py-2 sm:hidden"
        >
          <div className="flex flex-col gap-0.5">
            {sections.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                aria-current={isActiveNavLink(pathname, section.href) ? 'page' : undefined}
                className={`${linkClass(section.href, section.admin)} block px-3 py-2.5 text-base`}
              >
                {section.label}
              </Link>
            ))}

            <span aria-hidden className="my-1 h-px bg-surface-border" />

            <Link
              href="/dashboard/settings"
              aria-current={settingsActive ? 'page' : undefined}
              className={`${linkClass('/dashboard/settings')} block px-3 py-2.5 text-base`}
            >
              {t('settings')}
            </Link>
            <button
              type="button"
              className="rounded-lg px-3 py-2.5 text-left text-base text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
              onClick={() => signOut({ callbackUrl: '/' })}
            >
              {t('logOut')}
            </button>

            {/* Renders nothing where installing is impossible or already
                done, so this does not leave a dead heading behind. */}
            <div className="px-3 py-2">
              <InstallAppButton compact />
            </div>
          </div>
        </nav>
      )}
    </header>
  )
}
