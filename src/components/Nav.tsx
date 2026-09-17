'use client'

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

/**
 * The in-app header.
 *
 * It used to be one flat row of same-weight text — Community, Feedback,
 * the account name, Log out — with the tool icons trailing off the end and
 * nothing saying where you were. Three things were wrong with that:
 *
 * - the garage had no link at all, only the logo, which does not read as
 *   one;
 * - navigation and account actions looked identical, so "Log out" sat in
 *   the same visual rank as "Community";
 * - at phone width it collapsed. The wordmark ran into the first link, a
 *   long display name wrapped over three lines, and the language and theme
 *   controls were pushed off the edge entirely.
 *
 * So: sections are a real nav with the current one marked, account and
 * tools are a separate cluster, and below `sm` the sections move to their
 * own scrollable row instead of fighting for the same line.
 */
export default function Nav({ displayName, isAdmin }: { displayName: string; isAdmin?: boolean }) {
  const t = useTranslations('nav')
  const pathname = usePathname()

  const sections = [
    { href: '/dashboard', label: t('garage') },
    { href: '/community', label: t('community') },
    { href: '/tickets', label: t('feedback') },
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

        {/* Sections, inline once there is room for them. */}
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

        {/* Account and tools, pushed right and separated by a rule so they
            stop reading as more navigation. */}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <QuickAddButton />
          <ShortcutHelpButton />
          <LanguageToggle compact />
          <ThemeToggle compact />
          <span aria-hidden className="mx-1 hidden h-5 w-px bg-surface-border sm:block" />
          <Link
            href="/dashboard/settings"
            aria-label={t('accountAria')}
            aria-current={pathname === '/dashboard/settings' ? 'page' : undefined}
            className={`hidden max-w-[10rem] truncate rounded-lg px-2.5 py-1.5 text-sm transition-colors sm:block ${
              pathname === '/dashboard/settings'
                ? 'bg-surface-subtle font-medium text-ink'
                : 'text-ink-muted hover:bg-surface-subtle hover:text-ink'
            }`}
          >
            {displayName}
          </Link>
          <button
            type="button"
            className="hidden whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink sm:block"
            onClick={() => signOut({ callbackUrl: '/' })}
          >
            {t('logOut')}
          </button>
        </div>
      </div>

      {/* Below `sm` the sections get their own line. Scrollable rather than
          wrapped, so a fifth entry lengthens the strip instead of pushing
          the header down the screen. Settings and log out ride along here
          because they have nowhere else to be on a phone. */}
      <nav
        aria-label={t('sections')}
        className="flex items-center gap-1 overflow-x-auto px-4 pb-2 sm:hidden"
      >
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
        <Link
          href="/dashboard/settings"
          aria-current={pathname === '/dashboard/settings' ? 'page' : undefined}
          className={linkClass('/dashboard/settings')}
        >
          {t('settings')}
        </Link>
        <button
          type="button"
          className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
          onClick={() => signOut({ callbackUrl: '/' })}
        >
          {t('logOut')}
        </button>
      </nav>
    </header>
  )
}
