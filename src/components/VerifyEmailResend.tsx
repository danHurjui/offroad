'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

/**
 * The "send it again" button, shared by the dashboard banner and the
 * settings card so there is one description of what happened rather than
 * two that can drift apart.
 *
 * It reports four outcomes, and the reason they are separate is that
 * three of them are not the person's fault and need different next steps:
 * sent, throttled (wait), could-not-send (the deployment has no mail
 * provider, or the provider refused), and an unreachable network. A single
 * "try again" would be wrong for two of those.
 *
 * The address is never a parameter — the route reads it from the session's
 * own account. A resend that took a destination would be an open relay
 * with this app's name on the envelope.
 */
export default function VerifyEmailResend({ className = '' }: { className?: string }) {
  const t = useTranslations('verifyEmail')
  const tc = useTranslations('common')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function resend() {
    setState('sending')
    setMessage(null)
    try {
      const res = await fetch('/api/auth/verify-email/send', { method: 'POST' })
      const data = await res.json().catch(() => ({}))

      if (res.ok && data.sent) {
        setState('sent')
        setMessage(t('resent'))
        return
      }
      setState('idle')
      if (res.status === 429) {
        const minutes = Math.ceil((data.retryAfterSeconds ?? 60) / 60)
        // Pluralised by the catalogue — Romanian's rule is not English's.
        setMessage(t('resendRateLimited', { minutes }))
        return
      }
      // Covers both the 503 (nothing configured, or the provider refused)
      // and the already-verified case, where there is nothing to send and
      // saying "sent" would be false.
      setMessage(data.alreadyVerified ? t('nothingToSend') : t('resendFailed'))
    } catch {
      setState('idle')
      setMessage(tc('networkError'))
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        className="btn-secondary"
        onClick={resend}
        disabled={state === 'sending' || state === 'sent'}
      >
        {state === 'sending' ? t('resending') : t('resend')}
      </button>
      {message && (
        <p className="mt-2 text-xs text-ink-muted" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
