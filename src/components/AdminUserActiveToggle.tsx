'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Deactivate / reactivate a user. Deactivation asks for confirmation
 * because it takes effect on the person's live session, not just their
 * next login.
 */
export default function AdminUserActiveToggle({
  userId,
  displayName,
  active,
  disabledReason,
}: {
  userId: string
  displayName: string
  active: boolean
  disabledReason?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (disabledReason) {
    return <span className="text-xs text-ink-faint">{disabledReason}</span>
  }

  async function toggle() {
    setError(null)
    if (active && !window.confirm(`Deactivate ${displayName}? They will be signed out within a minute and cannot log back in.`)) {
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: !active }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not update this user')
        setBusy(false)
        return
      }
      setBusy(false)
      router.refresh()
    } catch {
      setError('Could not reach the server')
      setBusy(false)
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={active ? 'btn-danger py-1 text-xs' : 'btn-secondary py-1 text-xs'}
      >
        {busy ? '…' : active ? 'Deactivate' : 'Reactivate'}
      </button>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
