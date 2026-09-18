'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { TURNSTILE_SCRIPT_URL } from '@/lib/turnstileClient'

/**
 * The Cloudflare Turnstile widget, and — more importantly — what the form
 * around it is allowed to believe.
 *
 * Usually invisible: most visitors see a line of text appear and nothing
 * else. The states that matter are the ones where it does *not* work, and
 * the reason this is a component rather than three lines in each form is
 * that those states have to reach the person instead of leaving a submit
 * button disabled with no explanation. An ad blocker, a corporate filter
 * or a country-level block on challenges.cloudflare.com all produce
 * exactly that, and a login form that silently refuses to submit is
 * indistinguishable from a broken site.
 */

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'error-callback'?: () => void
      'expired-callback'?: () => void
      'timeout-callback'?: () => void
      theme?: 'auto' | 'light' | 'dark'
      action?: string
    }
  ) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
    /** The explicit-render callback name the script calls once it is ready. */
    onRigLogTurnstileLoad?: () => void
  }
}

export type TurnstileStatus = 'loading' | 'ready' | 'solved' | 'error' | 'blocked'

/** How long to wait for the script before saying something is blocking it. */
const LOAD_TIMEOUT_MS = 12_000

/**
 * Loads the script once per page, however many widgets ask for it.
 *
 * `render=explicit` means the script renders nothing by itself, so this
 * promise resolving is the only signal that `window.turnstile` exists.
 */
let scriptPromise: Promise<void> | null = null

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => {
      // Let a later mount try again rather than caching the failure for
      // the life of the page: this is usually a flaky network, and a
      // person who reopens the form deserves a second attempt.
      scriptPromise = null
      reject(new Error('turnstile script failed to load'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

export default function TurnstileWidget({
  siteKey,
  action,
  onToken,
  onStatus,
  resetSignal = 0,
}: {
  siteKey: string
  /** Names the form in Cloudflare's analytics — `login`, `register`, … */
  action?: string
  /** The token, or null whenever there isn't a usable one. */
  onToken: (token: string | null) => void
  onStatus?: (status: TurnstileStatus) => void
  /**
   * Increment to force a fresh token. Every form does this on submit:
   * Cloudflare rejects a token it has already seen, so without a reset a
   * second attempt after any failure fails the bot check rather than
   * whatever it actually got wrong.
   */
  resetSignal?: number
}) {
  const t = useTranslations('auth.turnstile')
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [status, setStatus] = useState<TurnstileStatus>('loading')

  // Held in refs so the render effect below can stay mounted-once: it must
  // not tear the widget down and build a new one every time a parent
  // re-renders with a new inline callback.
  const onTokenRef = useRef(onToken)
  const onStatusRef = useRef(onStatus)
  useEffect(() => {
    onTokenRef.current = onToken
    onStatusRef.current = onStatus
  })

  useEffect(() => {
    onStatusRef.current?.(status)
  }, [status])

  useEffect(() => {
    let cancelled = false

    const timeout = setTimeout(() => {
      // Only meaningful while nothing has arrived. A slow-but-working
      // script resolves below and moves the state on before this fires.
      if (!cancelled) setStatus((s) => (s === 'loading' ? 'blocked' : s))
    }, LOAD_TIMEOUT_MS)

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          // The app's theme is a class on <html>, not the OS preference,
          // so 'auto' would show a light widget to somebody who chose dark
          // on a light machine.
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
          callback: (token) => {
            if (cancelled) return
            setStatus('solved')
            onTokenRef.current(token)
          },
          'expired-callback': () => {
            if (cancelled) return
            // A token has a five-minute life. Somebody who left the form
            // open over lunch gets a new one rather than a rejection.
            setStatus('ready')
            onTokenRef.current(null)
            window.turnstile?.reset(widgetIdRef.current ?? undefined)
          },
          'timeout-callback': () => {
            if (cancelled) return
            setStatus('ready')
            onTokenRef.current(null)
            window.turnstile?.reset(widgetIdRef.current ?? undefined)
          },
          'error-callback': () => {
            if (cancelled) return
            setStatus('error')
            onTokenRef.current(null)
          },
        })
        setStatus((s) => (s === 'loading' ? 'ready' : s))
      })
      .catch(() => {
        if (!cancelled) setStatus('blocked')
      })

    return () => {
      cancelled = true
      clearTimeout(timeout)
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
    // Mount-once: siteKey and action are configuration, not state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (resetSignal === 0) return
    if (!widgetIdRef.current || !window.turnstile) return
    onTokenRef.current(null)
    setStatus('ready')
    window.turnstile.reset(widgetIdRef.current)
  }, [resetSignal])

  return (
    <div>
      <div ref={containerRef} aria-label={t('label')} />
      {/* Only the two dead ends get a sentence. A widget that is working
          — loading, ready, solved — says nothing, because it is meant to
          be something nobody has to think about. */}
      {(status === 'blocked' || status === 'error') && (
        <p className="mt-2 text-xs text-ink-muted">
          {status === 'blocked' ? t('blocked') : t('failed')}
        </p>
      )}
    </div>
  )
}
