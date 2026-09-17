'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

/**
 * Grant or revoke complimentary Pro. Granting asks for a reason, which is
 * stored alongside who granted it — a comp with no recorded justification
 * is the kind of thing nobody can explain six months later.
 */
export default function AdminCompProToggle({
  userId,
  displayName,
  isProComped,
  isPro,
}: {
  userId: string
  displayName: string
  isProComped: boolean
  isPro: boolean
}) {
  const tc = useTranslations('common')
  const t = useTranslations('admin')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(next: boolean, why?: string) {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isProComped: next, proCompedReason: why }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? t('updateFailed'))
        setBusy(false)
        return
      }
      setBusy(false)
      setOpen(false)
      setReason('')
      router.refresh()
    } catch {
      setError(tc('networkError'))
      setBusy(false)
    }
  }

  if (isProComped) {
    return (
      <div className="text-right">
        <button
          type="button"
          className="btn-secondary py-1 text-xs"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Remove complimentary Pro from ${displayName}?`)) send(false)
          }}
        >
          {busy ? '…' : t('removeComp')}
        </button>
        {/* Paid Pro is untouched by this, so say so rather than implying
            the person loses access. */}
        {isPro && <p className="mt-1 text-xs text-ink-faint">{t('paidPro')}</p>}
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    )
  }

  if (!open) {
    return (
      <div className="text-right">
        <button type="button" className="btn-secondary py-1 text-xs" onClick={() => setOpen(true)} disabled={busy}>
          {t('compPro')}
        </button>
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    )
  }

  return (
    <div className="w-full sm:w-72">
      <label className="label text-xs" htmlFor={`reason-${userId}`}>
        {t('whyPro', { name: displayName })}
      </label>
      <input
        id={`reason-${userId}`}
        className="input"
        value={reason}
        maxLength={500}
        autoFocus
        placeholder={t('reasonPlaceholder')}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className="btn-primary py-1 text-xs"
          disabled={busy || !reason.trim()}
          onClick={() => send(true, reason.trim())}
        >
          {busy ? t('granting') : t('grant')}
        </button>
        <button type="button" className="btn-secondary py-1 text-xs" onClick={() => setOpen(false)} disabled={busy}>
          {tc('cancel')}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
