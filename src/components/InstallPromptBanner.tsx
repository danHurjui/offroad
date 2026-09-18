'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  INSTALL_PROMPT_EVENT,
  clearCapturedInstallPrompt,
  isStandalone,
  readCapturedInstallPrompt,
  type InstallPromptEvent,
} from '@/lib/installPrompt'

/**
 * The offer, where somebody will actually meet it.
 *
 * There is no browser pop-up to wait for and there never will be: the
 * app defers `beforeinstallprompt`, which is exactly what suppresses
 * Chromium's own banner, and it does that so the offer can be made
 * somewhere chosen rather than wherever the browser felt like
 * interrupting. Having taken that on, the app has to actually make it —
 * and until this existed the only places it appeared were the collapsed
 * mobile menu and a card on the settings page, so on a desktop browser
 * an installable app offered nothing anyone would find.
 *
 * Shown once per device and dismissible. A dismissal is remembered for
 * `DISMISS_DAYS` rather than forever: a banner that returns tomorrow is
 * nagging, and one that never returns punishes somebody for tapping the
 * wrong thing once. The install card in settings is always there either
 * way, which is what makes the timeout safe to keep short.
 */

const DISMISSED_KEY = 'riglog-install-dismissed'
const DISMISS_DAYS = 30

/**
 * Whether the person told us not to, recently.
 *
 * Wrapped, because `localStorage` throws rather than returning null in a
 * private window and behind blocked site data — and the safe failure is
 * showing the banner, not crashing the dashboard around it.
 */
function dismissedRecently(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISSED_KEY))
    if (!Number.isFinite(at) || at <= 0) return false
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

export default function InstallPromptBanner() {
  const t = useTranslations('install')
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Hidden until proven otherwise, so nothing flashes on a device that
    // has the app already or was told no last week.
    const sync = () => {
      setPromptEvent(readCapturedInstallPrompt())
      setHidden(isStandalone() || dismissedRecently())
    }
    sync()

    const onInstalled = () => {
      setPromptEvent(null)
      setHidden(true)
    }

    window.addEventListener(INSTALL_PROMPT_EVENT, sync)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener(INSTALL_PROMPT_EVENT, sync)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function remember() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    } catch {
      // A device that cannot remember the dismissal still gets the
      // dismissal, for this page at least. Better than refusing to close.
    }
  }

  async function onInstall() {
    if (!promptEvent) return
    setBusy(true)
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    setBusy(false)
    clearCapturedInstallPrompt()
    setPromptEvent(null)
    // Declining the browser's own dialog is a "no" too — asking again on
    // the next page load would be the nagging this is meant to avoid.
    if (outcome === 'dismissed') remember()
    setHidden(true)
  }

  function onDismiss() {
    remember()
    setHidden(true)
  }

  if (hidden || !promptEvent) return null

  return (
    <div className="border-b border-surface-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-base font-bold text-white"
        >
          R
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{t('bannerTitle')}</p>
          <p className="text-xs text-ink-muted">{t('bannerBody')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={onDismiss}>
            {t('notNow')}
          </button>
          <button type="button" className="btn-primary text-sm" onClick={onInstall} disabled={busy}>
            {busy ? t('installing') : t('button')}
          </button>
        </div>
      </div>
    </div>
  )
}
