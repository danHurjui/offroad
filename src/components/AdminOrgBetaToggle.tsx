'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

/**
 * RL-038 closed beta: let this account create organisations. Switching it
 * off stops new ones and leaves existing organisations alone.
 */
export default function AdminOrgBetaToggle({ userId, enabled }: { userId: string; enabled: boolean }) {
  const tc = useTranslations('common')
  const t = useTranslations('admin')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orgBeta: !enabled }),
      })
      const data = await res.json().catch(() => ({}))
      setBusy(false)
      if (!res.ok) {
        setError(data.error ?? t('updateFailed'))
        return
      }
      router.refresh()
    } catch {
      setError(tc('networkError'))
      setBusy(false)
    }
  }

  return (
    <div className="text-right">
      <button type="button" className="btn-secondary py-1 text-xs" onClick={toggle} disabled={busy}>
        {busy ? '…' : t(enabled ? 'orgBetaOff' : 'orgBetaOn')}
      </button>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
