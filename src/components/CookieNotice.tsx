'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

const STORAGE_KEY = 'riglog-cookie-notice'

/**
 * A notice, not a consent banner — and the difference is deliberate.
 *
 * Every cookie this app sets is strictly necessary (see /cookies), which
 * is exempt from the ePrivacy consent requirement but still has to be
 * disclosed. So there is no Accept button to click and nothing changes
 * depending on what you do with it: dismissing only stops it reappearing.
 *
 * Offering a fake "Accept" for cookies that would be set regardless is the
 * thing this avoids. It trains people that the button is meaningless, and
 * on a site with real tracking it would be.
 *
 * The dismissal lives in localStorage rather than a cookie — using a
 * cookie to record that you have read the cookie notice is a joke that
 * writes itself, and localStorage keeps it off every request.
 */
export default function CookieNotice() {
  const t = useTranslations('cookieNotice')
  // Starts hidden and only appears after the check, so it never flashes up
  // for someone who dismissed it a month ago.
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== 'seen') setVisible(true)
    } catch {
      // Blocked storage (private mode): showing it every visit is the
      // harmless failure, so do that rather than hiding it entirely.
      setVisible(true)
    }
  }, [])

  function dismiss() {
    setVisible(false)
    try {
      localStorage.setItem(STORAGE_KEY, 'seen')
    } catch {
      // Nothing to do — it reappears next visit, which is not a problem.
    }
  }

  if (!visible) return null

  return (
    <div
      // Not a dialog and not a focus trap: it blocks nothing and demands
      // nothing, so it must not interrupt whatever the visitor is doing.
      role="region"
      aria-label={t('region')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-border bg-surface/95 px-4 py-3 shadow-panel backdrop-blur sm:py-4"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Text and button side by side at every width: stacked, it took a
          fifth of a phone screen to say something that needs no answer. */}
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <p className="text-xs leading-snug text-ink-muted sm:text-sm">
          {t.rich('body', {
            list: (chunks) => (
              <Link href="/cookies" className="text-brand-600 dark:text-brand-300 hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
        <button type="button" onClick={dismiss} className="btn-secondary shrink-0">
          {t('gotIt')}
        </button>
      </div>
    </div>
  )
}
