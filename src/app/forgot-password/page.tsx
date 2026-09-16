'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import AuthShell from '@/components/AuthShell'
import FormError from '@/components/FormError'

export default function ForgotPasswordPage() {
  const t = useTranslations('auth.forgot')
  const tc = useTranslations('common')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setLoading(false)
      // This used to set `sent` unconditionally, so a 500 (or a 429, or an
      // unconfigured mail provider) still showed "a reset link has been
      // sent" — the user waited for an email that was never going to come.
      if (res.ok) {
        setSent(true)
        return
      }
      const data = await res.json().catch(() => ({}))
      if (res.status === 429) {
        const mins = Math.ceil((data.retryAfterSeconds ?? 60) / 60)
        // Pluralised by the catalogue: Romanian's rule for this is not
        // English's, so "1 minute / # minutes" cannot be built by hand.
        setError(t('rateLimited', { minutes: mins }))
        return
      }
      setError(data.error ?? tc('genericError'))
    } catch {
      setLoading(false)
      setError(tc('networkError'))
    }
  }

  return (
    <AuthShell>
      <div className="card w-full max-w-sm p-6">
        <h1 className="mb-1 text-2xl font-bold text-ink">{t('title')}</h1>
        {sent ? (
          <p className="mt-4 text-sm text-ink-muted" role="status">
            {t('sent')}
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <div>
              <label className="label" htmlFor="email">{tc('email')}</label>
              <input
                id="email"
                name="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                enterKeyHint="send"
                autoCapitalize="off"
                spellCheck={false}
                autoFocus
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'forgot-error' : undefined}
              />
            </div>
            <FormError id="forgot-error">{error}</FormError>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? t('submitting') : t('submit')}
            </button>
          </form>
        )}
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-brand-600 dark:text-brand-300 hover:underline">
            {t('backToLogin')}
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
