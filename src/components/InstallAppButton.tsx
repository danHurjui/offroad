'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import InstallDiagnostics from './InstallDiagnostics'
import {
  INSTALL_PROMPT_EVENT,
  clearCapturedInstallPrompt,
  isIosSafari,
  isStandalone,
  readCapturedInstallPrompt,
  type InstallPromptEvent,
} from '@/lib/installPrompt'

/**
 * Offers to install the PWA, and only when that means something.
 *
 * Three states, because the browsers genuinely differ: already installed
 * (nothing to say), Chromium having offered a prompt we deferred (a
 * button), and iOS, which can install but exposes no API for it (the
 * manual steps). Everything else renders nothing rather than a button
 * that would do nothing when pressed.
 *
 * **It does not listen for `beforeinstallprompt` itself.** The inline
 * head script does (src/lib/installPrompt.ts), because Chromium fires
 * that event before this component — before React — exists, and it is
 * never replayed. This reads what the script caught and subscribes to the
 * event it raises, so it is correct on either side of that race. Adding a
 * `beforeinstallprompt` listener back here would not help and would
 * double-handle the one that arrives late.
 */
export default function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('install')
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [ios, setIos] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setInstalled(isStandalone())
    setIos(isIosSafari(navigator.userAgent, navigator.maxTouchPoints) && !isStandalone())

    // Read first: on a fast hydration the event has already been caught
    // and parked, and nothing further will be raised for it.
    const sync = () => setPromptEvent(readCapturedInstallPrompt())
    sync()

    const onInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
    }

    window.addEventListener(INSTALL_PROMPT_EVENT, sync)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener(INSTALL_PROMPT_EVENT, sync)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function onInstall() {
    if (!promptEvent) return
    setBusy(true)
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    setBusy(false)
    // The event is single-use: the browser will fire a fresh one if it
    // still considers the app installable, so drop this one either way —
    // from the global as well, or the next mount would read a spent event
    // and render a button that does nothing.
    clearCapturedInstallPrompt()
    setPromptEvent(null)
    if (outcome === 'dismissed') setDismissed(true)
  }

  if (installed) {
    return compact ? null : <p className="text-sm text-ink-muted">{t('installed')}</p>
  }

  if (promptEvent) {
    return (
      <div>
        {!compact && (
          <>
            <p className="mb-1 text-xs text-ink-muted">{t('body')}</p>
            {/* Deferring the event is what suppresses the browser's own
                banner, so somebody waiting for one waits forever. */}
            <p className="mb-3 text-xs text-ink-faint">{t('noBrowserPopup')}</p>
          </>
        )}
        <button type="button" className={compact ? 'btn-secondary w-full' : 'btn-primary'} onClick={onInstall} disabled={busy}>
          {busy ? t('installing') : t('button')}
        </button>
      </div>
    )
  }

  if (dismissed) return <p className="text-sm text-ink-muted">{t('dismissed')}</p>

  if (ios) {
    // No button: Safari has no install API, so one would be a lie.
    return (
      <div className="text-sm text-ink-muted">
        {!compact && <p className="font-medium text-ink">{t('iosTitle')}</p>}
        <p className={compact ? '' : 'mt-1'}>{t('iosBody')}</p>
      </div>
    )
  }

  // Nothing to offer: already installed elsewhere, a browser that cannot
  // install web apps, or one that simply has not offered.
  //
  // The compact placement still renders nothing — a header is no place
  // for an explanation. The full one says so out loud, because a card
  // with a heading and empty space under it cannot be told apart from a
  // broken one. That is precisely how a manifest carrying no PNG icons —
  // valid, and never installable — sat unnoticed: the button stopped
  // appearing and the page had no way to say why.
  if (compact) return null

  return (
    <div className="text-sm text-ink-muted">
      <p>{t('noOffer')}</p>
      <p className="mt-1 text-xs">{t('noOfferWhy')}</p>
      <p className="mt-1 text-xs">{t('noOfferAddressBar')}</p>
      <InstallDiagnostics offered={false} />
    </div>
  )
}
