'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
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
      setError('Incorrect email or password')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="mb-1 text-2xl font-bold text-ink">RigLog</h1>
        <p className="mb-6 text-sm text-ink-muted">Log in to your build.</p>

        <form onSubmit={onSubmit} className="space-y-4">
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
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <button
          className="btn-secondary mt-3 w-full"
          onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
        >
          Continue with Google
        </button>

        <div className="mt-4 flex justify-between text-sm">
          <Link href="/forgot-password" className="text-brand-600 hover:underline">
            Forgot password?
          </Link>
          <Link href="/register" className="text-brand-600 hover:underline">
            Create account
          </Link>
        </div>
        <div className="mt-3 text-center text-sm">
          <Link href="/community" className="text-ink-muted hover:underline">
            Browse community builds →
          </Link>
        </div>
      </div>
    </div>
  )
}
