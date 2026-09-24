'use client'

import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import { LOCALES, LOCALE_NAMES, LOCALE_SHORT, type Locale } from '@/i18n/config'
import { englishPath, fromEnglishPath, hasEnglishVersion } from '@/i18n/localeRoutes'

/**
 * Romanian/English switch, the language counterpart to ThemeToggle.
 *
 * Unlike the theme it cannot apply the change in the browser: the server
 * renders the text, so the choice has to reach it before anything can be
 * re-rendered in the new language. So it posts the choice (which sets the
 * cookie and, for a signed-in user, the account column) and then calls
 * `router.refresh()`, which re-fetches the current route's server
 * components in place — no full navigation, no lost scroll position, and
 * no lost form state.
 *
 * There is no optimistic update. Showing English labels a beat before the
 * page around them is English would read as a glitch; `useTransition`
 * keeps the control disabled and dimmed for that beat instead.
 */
export default function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const active = useLocale() as Locale
  const t = useTranslations('language')
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  function choose(next: Locale) {
    if (next === active || pending) return

    setFailed(false)
    startTransition(async () => {
      try {
        const res = await fetch('/api/me/locale', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ locale: next }),
        })
        if (!res.ok) throw new Error(String(res.status))
        // A public page with two addresses moves to the one in the chosen
        // language (an /en address is English whatever the cookie says);
        // everywhere else the cookie is the whole story.
        const romanianPath = fromEnglishPath(pathname ?? '/') ?? pathname ?? '/'
        const target = next === 'en' && hasEnglishVersion(romanianPath) ? englishPath(romanianPath) : romanianPath
        if (target !== pathname) {
          // A full load, not router.push: the root layout (html lang, the
          // client catalogue) is only rendered again on a document load,
          // and a soft navigation would leave it in the old language.
          window.location.assign(`${target}${window.location.search}${window.location.hash}`)
        } else {
          router.refresh()
        }
      } catch {
        // The page is still readable in the current language, so this is
        // not worth a dialog — but it must not silently do nothing either.
        setFailed(true)
      }
    })
  }

  if (compact) {
    // Header version: one button toggling between the two.
    const next = LOCALES[(LOCALES.indexOf(active) + 1) % LOCALES.length]
    return (
      <button
        type="button"
        onClick={() => choose(next)}
        disabled={pending}
        title={failed ? t('failed') : t('switchTo', { language: LOCALE_NAMES[next] })}
        aria-label={t('switchTo', { language: LOCALE_NAMES[next] })}
        className="flex h-10 min-w-10 items-center justify-center rounded-lg px-1.5 text-xs sm:h-8 sm:min-w-8 font-semibold text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50"
      >
        {LOCALE_SHORT[active]}
      </button>
    )
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={t('choose')}
        className="inline-flex rounded-lg border border-surface-border p-0.5"
      >
        {LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            role="radio"
            aria-checked={locale === active}
            disabled={pending}
            onClick={() => choose(locale)}
            // The language's own name, never translated: someone looking
            // for English cannot be expected to recognise "Engleză".
            lang={locale}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-60 ${
              locale === active
                ? 'bg-brand-500 text-white'
                : 'text-ink-muted hover:bg-surface-subtle hover:text-ink'
            }`}
          >
            {LOCALE_NAMES[locale]}
          </button>
        ))}
      </div>
      {failed && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {t('failed')}
        </p>
      )}
    </div>
  )
}
