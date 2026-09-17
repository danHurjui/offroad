'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { isIosSafari, isStandalone, type InstallPromptEvent } from '@/lib/installPrompt'

/**
 * Offers to install the PWA, and only when that means something.
 *
 * Three states, because the browsers genuinely differ: already installed
 * (nothing to say), Chromium having offered a prompt we deferred (a
 * button), and iOS, which can install but exposes no API for it (the
 * manual steps). Everything else renders nothing rather than a button
 * that would do nothing when pressed.
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

    const onPrompt = (e: Event) => {
      // Chromium shows its own mini-infobar unless the event is
      // preventDefault()ed; deferring it is what lets the app put the
      // offer somewhere the person will actually find it.
      e.preventDefault()
      setPromptEvent(e as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
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
    // still considers the app installable, so drop this one either way.
    setPromptEvent(null)
    if (outcome === 'dismissed') setDismissed(true)
  }

  if (installed) {
    return compact ? null : <p className="text-sm text-ink-muted">{t('installed')}</p>
  }

  if (promptEvent) {
    return (
      <div>
        {!compact && <p className="mb-3 text-xs text-ink-muted">{t('body')}</p>}
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

  // Already installed on another browser, not installable, or the browser
  // has not decided yet — nothing honest to offer.
  return null
}
