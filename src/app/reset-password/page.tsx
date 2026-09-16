'use client'

import { Suspense, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthShell from '@/components/AuthShell'
import FormError from '@/components/FormError'
import PasswordInput from '@/components/PasswordInput'
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter'
import { MIN_PASSWORD_LENGTH } from '@/lib/passwordStrength'

function ResetPasswordForm() {
  const t = useTranslations('auth.reset')
  const tc = useTranslations('common')
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Only complain once they've actually typed something into the second
  // field — flagging a mismatch on an empty box is just noise.
  const mismatch = confirm.length > 0 && confirm !== password

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    // A typo here locks you out of your own account, and the API only ever
    // sees one of the two values — so this check has to happen client-side.
    if (password !== confirm) {
      setError(t('mismatch'))
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      setLoading(false)
      if (!res.ok) {
        setError(data.error ?? tc('genericError'))
        return
      }
      router.push('/login')
    } catch {
      setLoading(false)
      setError(tc('networkError'))
    }
  }

  if (!token) {
    return (
      <div className="card w-full max-w-sm p-6">
        <h1 className="mb-2 text-2xl font-bold text-ink">{t('incompleteTitle')}</h1>
        <p className="mb-4 text-sm text-ink-muted">{t('incompleteBody')}</p>
        <Link href="/forgot-password" className="btn-primary w-full">
          {t('requestNew')}
        </Link>
      </div>
    )
  }

  return (
    <div className="card w-full max-w-sm p-6">
      <h1 className="mb-4 text-2xl font-bold text-ink">{t('title')}</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <PasswordInput
            id="password"
            label={t('newPassword')}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            describedBy="password-strength"
            autoFocus
          />
          <PasswordStrengthMeter password={password} id="password-strength" />
        </div>
        <div>
          <PasswordInput
            id="confirm"
            label={t('confirmPassword')}
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            invalid={mismatch}
            describedBy={mismatch ? 'confirm-mismatch' : undefined}
          />
          {mismatch && (
            <p id="confirm-mismatch" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {t('mismatchYet')}
            </p>
          )}
        </div>
        <FormError id="reset-error">{error}</FormError>
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={loading || mismatch || password.length < MIN_PASSWORD_LENGTH}
        >
          {loading ? tc('saving') : t('submit')}
        </button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  )
}
