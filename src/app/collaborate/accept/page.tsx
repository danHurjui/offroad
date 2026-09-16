'use client'

import { Suspense, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('collaborate')
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
        if (!res.ok) throw new Error(data.error ?? t('acceptFailed'))
        setVehicleId(data.vehicleId)
        setState('accepted')
      })
      .catch((err) => {
        setError(err.message)
        setState('error')
      })
    // `t` is stable for a given render tree, and adding it would re-run
    // the accept on a language change — which would double-accept.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, token, state])

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="card w-full max-w-sm p-6 text-center">
        <h1 className="mb-4 text-2xl font-bold text-ink">RigLog</h1>

        {!token && <p className="text-sm text-red-600 dark:text-red-400">{t('missingToken')}</p>}

        {token && status === 'loading' && <p className="text-sm text-ink-muted">{t('checkingSession')}</p>}

        {token && status === 'unauthenticated' && (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              {t('invited')}
            </p>
            <div className="flex justify-center gap-3">
              <Link href="/login" className="btn-primary">
                {t('logIn')}
              </Link>
              <Link href="/register" className="btn-secondary">
                {t('createAccount')}
              </Link>
            </div>
          </div>
        )}

        {token && (state === 'accepting') && <p className="text-sm text-ink-muted">{t('accepting')}</p>}

        {token && state === 'accepted' && (
          <div className="space-y-3">
            <p className="text-sm text-ink">{t('accepted')}</p>
            <Link href={vehicleId ? `/dashboard/vehicles/${vehicleId}` : '/dashboard'} className="btn-primary inline-block">
              {t('viewBuild')}
            </Link>
          </div>
        )}

        {token && state === 'error' && (
          <div className="space-y-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <Link href="/dashboard" className="btn-secondary inline-block">
              {t('goToDashboard')}
            </Link>
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
