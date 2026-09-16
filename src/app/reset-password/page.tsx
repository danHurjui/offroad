'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import FormError from '@/components/FormError'
import PasswordInput from '@/components/PasswordInput'
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter'
import { MIN_PASSWORD_LENGTH } from '@/lib/passwordStrength'

function ResetPasswordForm() {
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
      setError('The two passwords do not match.')
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
        setError(data.error ?? 'Something went wrong')
        return
      }
      router.push('/login')
    } catch {
      setLoading(false)
      setError('Could not reach the server. Please check your connection and try again.')
    }
  }

  if (!token) {
    return (
      <div className="card w-full max-w-sm p-6">
        <h1 className="mb-2 text-2xl font-bold text-ink">Reset link is incomplete</h1>
        <p className="mb-4 text-sm text-ink-muted">
          This link is missing its token — some mail apps break long links across lines. Copy the
          whole link from the email, or request a new one.
        </p>
        <Link href="/forgot-password" className="btn-primary w-full">
          Request a new link
        </Link>
      </div>
    )
  }

  return (
    <div className="card w-full max-w-sm p-6">
      <h1 className="mb-4 text-2xl font-bold text-ink">Set a new password</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <PasswordInput
            id="password"
            label="New password"
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
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            invalid={mismatch}
            describedBy={mismatch ? 'confirm-mismatch' : undefined}
          />
          {mismatch && (
            <p id="confirm-mismatch" className="mt-1 text-xs text-red-600 dark:text-red-400">
              These don&rsquo;t match yet.
            </p>
          )}
        </div>
        <FormError id="reset-error">{error}</FormError>
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={loading || mismatch || password.length < MIN_PASSWORD_LENGTH}
        >
          {loading ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  )
}
