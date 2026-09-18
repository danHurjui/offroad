'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AuthShell from '@/components/AuthShell'

/**
 * Where the link in the confirmation email lands.
 *
 * It spends the token on arrival rather than showing a "confirm" button.
 * The click in the inbox *was* the confirmation — asking for a second one
 * adds a step that can only be got wrong, and the mail clients that
 * prefetch links would press the button anyway.
 *
 * No session is needed here, and that is the point: the link is opened by
 * whichever browser the mail app hands it to, which is routinely not the
 * one that signed up.
 */

type State =
  | { phase: 'checking' }
  | { phase: 'done'; already: boolean }
  | { phase: 'failed'; reason: 'expired' | 'invalid' }

function Card({
  title,
  body,
  muted,
  children,
}: {
  title: string
  body: string
  muted?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="card w-full max-w-sm p-6">
      <h1 className="mb-2 text-2xl font-bold text-ink">{title}</h1>
      <p className={`mb-5 text-sm ${muted ? 'text-ink-faint' : 'text-ink-muted'}`}>{body}</p>
      {children}
    </div>
  )
}

function VerifyEmail() {
  const t = useTranslations('verifyEmail')
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [state, setState] = useState<State>({ phase: 'checking' })

  // React runs effects twice under development's strict mode. Consuming is
  // idempotent so the second run still answers correctly, but the request
  // is wasted and it spends one of the rate-limit budget.
  const attempted = useRef(false)

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok) {
          setState({ phase: 'done', already: data.alreadyVerified === true })
          return
        }
        setState({ phase: 'failed', reason: data.code === 'expired' ? 'expired' : 'invalid' })
      } catch {
        if (cancelled) return
        // A dropped connection is not a bad token. Answering "invalid"
        // here would send somebody to request a replacement link that
        // behaves exactly the same way, so this says the neutral thing and
        // the retry is reloading the page.
        setState({ phase: 'failed', reason: 'invalid' })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token])

  if (!token) {
    return (
      <Card title={t('missingTitle')} body={t('missingBody')}>
        <Link href="/login" className="btn-primary inline-block">
          {t('toLogin')}
        </Link>
      </Card>
    )
  }

  if (state.phase === 'checking') {
    return (
      <Card title={t('successTitle')} body={t('checking')} muted>
        <span className="sr-only" role="status">
          {t('checking')}
        </span>
      </Card>
    )
  }

  if (state.phase === 'done') {
    return (
      <Card title={t('successTitle')} body={state.already ? t('alreadyBody') : t('successBody')}>
        <Link href="/dashboard" className="btn-primary inline-block">
          {t('toDashboard')}
        </Link>
      </Card>
    )
  }

  return (
    <Card
      title={state.reason === 'expired' ? t('expiredTitle') : t('invalidTitle')}
      body={state.reason === 'expired' ? t('expiredBody') : t('invalidBody')}
    >
      <Link href="/login" className="btn-primary inline-block">
        {t('toLogin')}
      </Link>
    </Card>
  )
}

export default function VerifyEmailPage() {
  return (
    <AuthShell>
      <Suspense fallback={<div className="card w-full max-w-sm p-6" />}>
        <VerifyEmail />
      </Suspense>
    </AuthShell>
  )
}
