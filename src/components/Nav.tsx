'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { signOut } from 'next-auth/react'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import LanguageToggle from './LanguageToggle'
import QuickAddButton from './QuickAddButton'
import ShortcutHelpButton from './ShortcutHelpButton'

export default function Nav({ displayName, isAdmin }: { displayName: string; isAdmin?: boolean }) {
  const t = useTranslations('nav')

  return (
    <header className="sticky top-0 z-10 border-b border-surface-border bg-surface/90 backdrop-blur"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="text-brand-600 dark:text-brand-300" aria-label={t('dashboardAria')}>
          <Logo />
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/community" className="text-ink-muted hover:text-ink">
            {t('community')}
          </Link>
          <Link href="/tickets" className="hidden text-ink-muted hover:text-ink sm:inline">
            {t('feedback')}
          </Link>
          {isAdmin && (
            <Link href="/admin" className="text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200">
              {t('admin')}
            </Link>
          )}
          <Link href="/dashboard/settings" className="text-ink-muted hover:text-ink">
            {displayName}
          </Link>
          <button className="text-ink-muted hover:text-ink" onClick={() => signOut({ callbackUrl: '/' })}>
            {t('logOut')}
          </button>
          <QuickAddButton />
          <ShortcutHelpButton />
          <LanguageToggle compact />
          <ThemeToggle compact />
        </div>
      </div>
    </header>
  )
}
