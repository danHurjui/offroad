'use client'

import { useCallback, useState } from 'react'
import TurnstileWidget, { type TurnstileStatus } from './TurnstileWidget'
import { turnstileSiteKey } from '@/lib/turnstileClient'

/**
 * Everything a form needs to carry a Turnstile token, in one place.
 *
 * The three anonymous forms need identical wiring and one thing that is
 * easy to forget: **spend a token once**. Cloudflare rejects a token it
 * has already seen, so a form that keeps the first one turns a single
 * mistyped password into a form that can never be submitted again — and
 * the failure surfaces as "incorrect password", which sends the person
 * looking in entirely the wrong place. `reset()` after every attempt is
 * what prevents that, and putting it here means it cannot be left out of
 * one of the three.
 *
 * When no site key is configured, `enabled` is false, `widget` is null
 * and `token` stays null. The forms still submit; the server is what
 * decides whether a missing token matters, and with the check switched
 * off it does not.
 */
export function useTurnstile(action: string) {
  const siteKey = turnstileSiteKey()
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<TurnstileStatus>('loading')
  const [resetSignal, setResetSignal] = useState(0)

  const reset = useCallback(() => setResetSignal((n) => n + 1), [])

  const pending = siteKey !== null && token === null

  return {
    enabled: siteKey !== null,
    token,
    reset,
    /**
     * True when the widget is on but has not produced a token yet.
     * Submitting in this state wastes a round trip to be told the check
     * failed, so the forms hold the submission and say what is happening.
     */
    pending,
    /**
     * Which sentence to show when a submission is held — and the reason
     * this is not simply "waiting".
     *
     * A widget whose script an ad blocker, a corporate filter or a
     * country-level block has stopped from loading will never produce a
     * token, so "waiting for the anti-bot check" would be a message that
     * waiting cannot resolve. The person needs to know it is their
     * network, not the site being slow, because the fix is theirs: allow
     * challenges.cloudflare.com, or use another connection. There is no
     * way around it from here — accepting a request that says "the
     * widget was blocked" would be accepting whatever a script chose to
     * claim.
     */
    holdReason: (status === 'blocked'
      ? 'blocked'
      : status === 'error'
        ? 'failed'
        : 'pending') as 'blocked' | 'failed' | 'pending',
    widget: siteKey ? (
      <TurnstileWidget
        siteKey={siteKey}
        action={action}
        onToken={setToken}
        onStatus={setStatus}
        resetSignal={resetSignal}
      />
    ) : null,
  }
}
