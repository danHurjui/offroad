'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

/**
 * RL-042: make an organisation free (no charge, no vehicle cap) or end
 * that. Ending it asks first — with no plan every vehicle turns read-only.
 */
export default function AdminOrgCompToggle({ orgId, name, comped }: { orgId: string; name: string; comped: boolean }) {
  const tc = useTranslations('common')
  const t = useTranslations('admin')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    if (comped && !window.confirm(t('orgCompOffConfirm', { name }))) return
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ comped: !comped }),
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
        {busy ? '…' : t(comped ? 'orgCompOff' : 'orgCompOn')}
      </button>
      {error && <p className="mt-1 max-w-xs text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
