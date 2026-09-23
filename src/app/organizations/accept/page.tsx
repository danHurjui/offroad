'use client'

import { Suspense, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

type AcceptState = 'idle' | 'accepting' | 'accepted' | 'error'

// RL-038: the link in an organisation invitation. Same shape as the
// collaborator one (/collaborate/accept): a visitor without a session is
// sent to log in or register with the invited address and come back.
function AcceptOrganizationForm() {
  const t = useTranslations('organizations.accept')
  const { status } = useSession()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [state, setState] = useState<AcceptState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'authenticated' || !token || state !== 'idle') return
    setState('accepting')
    fetch('/api/organizations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? t('failed'))
        setOrganizationId(data.organizationId)
        setState('accepted')
      })
      .catch((err) => {
        setError(err.message)
        setState('error')
      })
    // `t` is left out on purpose: a language change must not accept twice.
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
            <p className="text-sm text-ink-muted">{t('invited')}</p>
            <div className="flex justify-center gap-3">
              <Link href="/login" className="btn-primary">{t('logIn')}</Link>
              <Link href="/register" className="btn-secondary">{t('createAccount')}</Link>
            </div>
          </div>
        )}

        {token && state === 'accepting' && <p className="text-sm text-ink-muted">{t('accepting')}</p>}

        {token && state === 'accepted' && (
          <div className="space-y-3">
            <p className="text-sm text-ink">{t('accepted')}</p>
            <Link href={organizationId ? `/dashboard/organizations/${organizationId}` : '/dashboard/organizations'} className="btn-primary inline-block">
              {t('open')}
            </Link>
          </div>
        )}

        {token && state === 'error' && (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <Link href="/dashboard" className="btn-secondary inline-block">{t('goToDashboard')}</Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AcceptOrganizationPage() {
  return (
    <Suspense fallback={null}>
      <AcceptOrganizationForm />
    </Suspense>
  )
}
