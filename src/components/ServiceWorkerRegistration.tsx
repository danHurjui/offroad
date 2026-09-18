'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SKIP_WAITING_MESSAGE } from '@/lib/serviceWorker'

/**
 * Registers the offline worker, and tells somebody when the build they
 * are running has been superseded.
 *
 * ## Why the offer, rather than just swapping
 *
 * The worker used to call `skipWaiting()` on install, which takes control
 * the moment a new one is ready. For an app whose whole job is somebody
 * typing up a job they just finished on a driveway, having the page
 * replaced underneath them is the wrong default. The new worker now
 * waits, this component notices it waiting, and the reload happens when
 * the person says so.
 *
 * ## The two ways this goes wrong if the guards are dropped
 *
 * **Prompting on a first visit.** A brand new install also produces a
 * worker in `installed`, with nothing to update *from*. The guard is
 * `navigator.serviceWorker.controller` — null means this page is not
 * controlled yet, so that worker is the first one, not a newer one.
 *
 * **Reloading in a loop.** `clients.claim()` in the worker's activate
 * fires `controllerchange` on that same first install. Reloading on every
 * `controllerchange` would therefore reload a first-time visitor, and
 * reload again on the next one. So the reload is tied to the person
 * having actually accepted: `accepted` is the only thing that arms it.
 */
export default function ServiceWorkerRegistration() {
  const t = useTranslations('appUpdate')
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const accepted = useRef(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let cancelled = false
    let registration: ServiceWorkerRegistration | null = null

    /**
     * A worker that has finished installing while this page is already
     * controlled is a *newer* build than the one running here. Without
     * the controller check this also catches the first install ever,
     * which is not an update and must not be announced as one.
     */
    const offerIfNewer = (worker: ServiceWorker | null) => {
      if (cancelled || !worker) return
      if (!navigator.serviceWorker.controller) return
      if (worker.state === 'installed') setWaiting(worker)
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        if (cancelled) return
        registration = reg

        // Already waiting before this page loaded — a tab opened after a
        // deploy but before the reload was accepted.
        offerIfNewer(reg.waiting)

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing
          if (!installing) return
          installing.addEventListener('statechange', () => offerIfNewer(installing))
        })
      })
      .catch(() => {
        // The offline shell is a progressive enhancement — a failed
        // registration must never stop the app working online.
      })

    const onControllerChange = () => {
      // Armed only by an accepted offer. See the note above on why
      // reloading on every controllerchange reloads first-time visitors.
      if (!accepted.current) return
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    /**
     * A browser checks for a new worker on navigation. An installed PWA
     * that somebody leaves open for days never navigates, so it would
     * never find out. Checking when the tab comes back to the foreground
     * covers that, throttled because it is a network request and the
     * answer changes at most once per deploy.
     */
    let lastCheck = Date.now()
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return
      lastCheck = Date.now()
      registration?.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const reload = useCallback(() => {
    if (!waiting) return
    accepted.current = true
    // The worker calls skipWaiting() on this, takes control, and the
    // controllerchange handler above reloads the page.
    waiting.postMessage(SKIP_WAITING_MESSAGE)
  }, [waiting])

  if (!waiting || dismissed) return null

  return (
    <div
      data-app-update
      // Above the cookie notice (z-40) on the rare occasion both are up:
      // one is a standing disclosure, the other is a thing to act on now.
      className="fixed inset-x-0 bottom-0 z-50 border-t border-brand-200 bg-brand-50 p-4 dark:border-brand-500/40 dark:bg-brand-500/10"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
      role="status"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{t('title')}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{t('body')}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn-primary" onClick={reload}>
            {t('reload')}
          </button>
          <button
            type="button"
            className="rounded-lg px-2.5 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
            onClick={() => setDismissed(true)}
          >
            {t('later')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * How long to leave between foreground update checks. Long, because the
 * answer only changes when something is deployed, and a PWA left open on
 * a phone would otherwise make this request every time it is glanced at.
 */
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000
