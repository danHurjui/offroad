'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

type AcceptState = 'idle' | 'accepting' | 'accepted' | 'error'

// RL-030: invite-link landing page. Unauthenticated visitors are pointed at
// login/register (with instructions to use the invited email, then come
// back to this same link) rather than being auto-redirected — NextAuth's
// credentials flow has no built-in callbackUrl chaining here, and the
// invite link itself stays valid to revisit after logging in.
function AcceptCollaborateForm() {
  const { status } = useSession()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [state, setState] = useState<AcceptState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [vehicleId, setVehicleId] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'authenticated' || !token || state !== 'idle') return
    setState('accepting')
    fetch('/api/collaborate/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Could not accept invite')
        setVehicleId(data.vehicleId)
        setState('accepted')
      })
      .catch((err) => {
        setError(err.message)
        setState('error')
      })
  }, [status, token, state])

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="card w-full max-w-sm p-6 text-center">
        <h1 className="mb-4 text-2xl font-bold text-ink">RigLog</h1>

        {!token && <p className="text-sm text-red-600 dark:text-red-400">This invite link is missing its token.</p>}

        {token && status === 'loading' && <p className="text-sm text-ink-muted">Checking your session…</p>}

        {token && status === 'unauthenticated' && (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              You&apos;ve been invited to collaborate on a build in RigLog. Log in or create an account using the
              email address the invite was sent to, then come back to this link to accept.
            </p>
            <div className="flex justify-center gap-3">
              <Link href="/login" className="btn-primary">Log in</Link>
              <Link href="/register" className="btn-secondary">Create account</Link>
            </div>
          </div>
        )}

        {token && (state === 'accepting') && <p className="text-sm text-ink-muted">Accepting invite…</p>}

        {token && state === 'accepted' && (
          <div className="space-y-3">
            <p className="text-sm text-ink">You&apos;re in! You now have collaborator access to this build.</p>
            <Link href={vehicleId ? `/dashboard/vehicles/${vehicleId}` : '/dashboard'} className="btn-primary inline-block">
              View build
            </Link>
          </div>
        )}

        {token && state === 'error' && (
          <div className="space-y-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <Link href="/dashboard" className="btn-secondary inline-block">Go to dashboard</Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AcceptCollaboratePage() {
  return (
    <Suspense fallback={null}>
      <AcceptCollaborateForm />
    </Suspense>
  )
}
