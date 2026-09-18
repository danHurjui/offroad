'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AuthShell from '@/components/AuthShell'
import FormError from '@/components/FormError'
import PasswordInput from '@/components/PasswordInput'
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import { MIN_PASSWORD_LENGTH } from '@/lib/passwordStrength'
import { useTurnstile } from '@/components/useTurnstile'

export default function RegisterPage() {
  const t = useTranslations('auth.register')
  const tc = useTranslations('common')
  const tt = useTranslations('auth.turnstile')
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const turnstile = useTurnstile('register')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (turnstile.pending) {
      setError(tt(turnstile.holdReason))
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          email,
          password,
          turnstileToken: turnstile.token ?? '',
        }),
      })
      // One token, one attempt — whatever the answer was.
      turnstile.reset()
      const data = await res.json()
      if (!res.ok) {
        // The route's own message, which is translated server-side from
        // the same cookie this page was rendered from (src/lib/apiError.ts).
        setError(data.error ?? t('failed'))
        setLoading(false)
        return
      }
      const result = await signIn('credentials', { email, password, redirect: false })
      setLoading(false)
      if (result?.error) {
        router.push('/login')
        return
      }
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError(t('failed'))
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <div className="card w-full max-w-sm p-6">
        <h1 className="mb-1 text-2xl font-bold text-ink">{t('title')}</h1>
        <p className="mb-6 text-sm text-ink-muted">{t('subtitle')}</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="displayName">{t('name')}</label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
              autoFocus
              required
            />
            <p className="mt-1 text-xs text-ink-faint">{t('nameHelp')}</p>
          </div>
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
              enterKeyHint="next"
              autoCapitalize="off"
              spellCheck={false}
              required
            />
          </div>
          <div>
            <PasswordInput
              id="password"
              label={tc('password')}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              describedBy="password-strength"
            />
            <PasswordStrengthMeter password={password} id="password-strength" />
            {!password && (
              <p className="mt-1 text-xs text-ink-faint">
                {t('passwordHelp', { min: MIN_PASSWORD_LENGTH })}
              </p>
            )}
          </div>
          {turnstile.widget}
          <FormError id="register-error">{error}</FormError>
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? t('submitting') : t('submit')}
          </button>
          {/* One sentence with two links inside it. Rich text rather than
              three concatenated fragments, because the word order around
              the links differs between languages. */}
          <p className="text-center text-xs text-ink-faint">
            {t.rich('terms', {
              terms: (chunks) => (
                <Link href="/terms" className="underline hover:text-ink-muted">
                  {chunks}
                </Link>
              ),
              privacy: (chunks) => (
                <Link href="/privacy" className="underline hover:text-ink-muted">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </form>

        <GoogleSignInButton />

        <p className="mt-4 text-center text-sm">
          {t('haveAccount')}{' '}
          <Link href="/login" className="text-brand-600 dark:text-brand-300 hover:underline">
            {t('logIn')}
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
