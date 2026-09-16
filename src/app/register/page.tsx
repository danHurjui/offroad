'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FormError from '@/components/FormError'
import PasswordInput from '@/components/PasswordInput'
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter'
import { MIN_PASSWORD_LENGTH } from '@/lib/passwordStrength'

export default function RegisterPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Registration failed')
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
      setError('Registration failed')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="mb-1 text-2xl font-bold text-ink">Create your account</h1>
        <p className="mb-6 text-sm text-ink-muted">Start logging your build for free.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="displayName">Name</label>
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
            <p className="mt-1 text-xs text-ink-faint">Shown on your public builds.</p>
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
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
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              describedBy="password-strength"
            />
            <PasswordStrengthMeter password={password} id="password-strength" />
            {!password && (
              <p className="mt-1 text-xs text-ink-faint">At least {MIN_PASSWORD_LENGTH} characters.</p>
            )}
          </div>
          <FormError id="register-error">{error}</FormError>
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
          <p className="text-center text-xs text-ink-faint">
            By creating an account you agree to our{' '}
            <Link href="/privacy" className="underline hover:text-ink-muted">
              privacy policy
            </Link>
            .
          </p>
        </form>

        <p className="mt-4 text-center text-sm">
          Already have an account?{' '}
          <Link href="/login" className="text-brand-600 dark:text-brand-300 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
