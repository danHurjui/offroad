'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AuthShell from '@/components/AuthShell'
import FormError from '@/components/FormError'
import PasswordInput from '@/components/PasswordInput'
import GoogleSignInButton from '@/components/GoogleSignInButton'

export default function LoginPage() {
  const t = useTranslations('auth.login')
  const tc = useTranslations('common')
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const result = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (result?.error) {
      setError(t('badCredentials'))
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <AuthShell>
      <div className="card w-full max-w-sm p-6">
        {/* The product name is not translated — it is the brand. */}
        <h1 className="mb-1 text-2xl font-bold text-ink">RigLog</h1>
        <p className="mb-6 text-sm text-ink-muted">{t('subtitle')}</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">{tc('email')}</label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              // The three that make a phone keyboard usable: the right keys,
              // no capitalisation of the first letter, and a "Go" key instead
              // of a newline.
              autoComplete="email"
              inputMode="email"
              enterKeyHint="go"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>
          <PasswordInput
            id="password"
            label={tc('password')}
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            invalid={Boolean(error)}
            describedBy={error ? 'login-error' : undefined}
          />
          <FormError id="login-error">{error}</FormError>
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? t('submitting') : t('submit')}
          </button>
        </form>

        <GoogleSignInButton />

        <div className="mt-4 flex justify-between text-sm">
          <Link href="/forgot-password" className="text-brand-600 dark:text-brand-300 hover:underline">
            {t('forgot')}
          </Link>
          <Link href="/register" className="text-brand-600 dark:text-brand-300 hover:underline">
            {t('createAccount')}
          </Link>
        </div>
        <div className="mt-3 text-center text-sm">
          <Link href="/community" className="text-ink-muted hover:underline">
            {t('browseCommunity')}
          </Link>
        </div>
      </div>
    </AuthShell>
  )
}
