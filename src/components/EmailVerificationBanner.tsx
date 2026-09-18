'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import VerifyEmailResend from './VerifyEmailResend'

/**
 * The unconfirmed-address notice, under the header on every dashboard
 * page.
 *
 * Whether it renders at all is decided on the server — the layout only
 * mounts this for an account that is genuinely unconfirmed on a
 * deployment that can genuinely send the link. This component's only job
 * is the dismissal, which needs the browser.
 *
 * Dismissable for a day, not for a month like the install offer. The two
 * are asking for different things: installing is a convenience somebody
 * is free to never want, while this is holding back features the account
 * is otherwise entitled to, so it has to come back. A day is long enough
 * that it is not nagging within one sitting.
 */

const DISMISSED_KEY = 'riglog-verify-email-dismissed'
const DISMISS_HOURS = 24

function dismissedRecently(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISSED_KEY))
    if (!Number.isFinite(at) || at <= 0) return false
    return Date.now() - at < DISMISS_HOURS * 60 * 60 * 1000
  } catch {
    // Private windows and blocked site data throw here rather than
    // answering null. Showing the banner is the safe way to be wrong.
    return false
  }
}

export default function EmailVerificationBanner({ email }: { email: string }) {
  const t = useTranslations('verifyEmail')
  // Hidden until the check has run, so it does not flash on a device that
  // waved it away this morning.
  const [hidden, setHidden] = useState(true)

  useEffect(() => setHidden(dismissedRecently()), [])

  if (hidden) return null

  return (
    <div
      // A stable anchor for the live suite: whether this is on the page is
      // the difference between the rule being enforced and merely
      // configured, and matching on the heading text would break the
      // moment the wording improved or the language changed.
      data-verify-banner
      className="border-b border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {t('bannerTitle')}
          </p>
          <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-200/80">
            {t('bannerBody', { email })}
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <VerifyEmailResend />
          <button
            type="button"
            className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm text-amber-900/80 hover:bg-amber-100 dark:text-amber-200/80 dark:hover:bg-amber-500/20"
            onClick={() => {
              try {
                window.localStorage.setItem(DISMISSED_KEY, String(Date.now()))
              } catch {
                // Nothing to do — it reappears on the next page, which is
                // a worse experience than remembering but not a broken one.
              }
              setHidden(true)
            }}
          >
            {t('bannerDismiss')}
          </button>
        </div>
      </div>
    </div>
  )
}
