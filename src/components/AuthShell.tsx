'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import LanguageToggle from './LanguageToggle'
import Logo from './Logo'

/**
 * The centred card every signed-out auth screen sits in.
 *
 * It exists for the language switcher. Someone who cannot read Romanian
 * has to be able to change the language *before* they have an account to
 * store the preference on — and these four pages are the only ones they
 * can reach. The in-app header (Nav) and the marketing header
 * (PublicHeader) carry their own copy; without this one, login would be
 * the single screen in the app with no way out of a language you don't
 * read.
 *
 * The theme toggle is deliberately not here: a dark-mode preference is
 * already applied from localStorage before first paint, so there is
 * nothing to fix from this screen.
 *
 * The logo links home: these pages are reached from the marketing site,
 * and without it the only way back was the browser's back button. On a
 * phone the card sits near the top rather than dead centre, so the
 * keyboard opening does not shove the fields off screen.
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav')
  return (
    <div className="flex min-h-screen flex-col items-center bg-surface-muted px-4 py-6 sm:justify-center sm:py-10">
      <div className="mb-4 flex w-full max-w-sm items-center justify-between">
        <Link href="/" className="rounded-lg text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-brand-300" aria-label={t('homeAria')}>
          <Logo />
        </Link>
        <LanguageToggle compact />
      </div>
      {children}
    </div>
  )
}
