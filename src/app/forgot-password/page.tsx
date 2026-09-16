'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
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
        setError(`Too many reset requests. Please try again in about ${mins} minute${mins === 1 ? '' : 's'}.`)
        return
      }
      setError(data.error ?? 'Something went wrong. Please try again.')
    } catch {
      setLoading(false)
      setError('Could not reach the server. Please check your connection and try again.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="mb-1 text-2xl font-bold text-ink">Reset your password</h1>
        {sent ? (
          <p className="mt-4 text-sm text-ink-muted">
            If that email exists, a reset link has been sent.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-brand-600 dark:text-brand-300 hover:underline">Back to login</Link>
        </p>
      </div>
    </div>
  )
}
