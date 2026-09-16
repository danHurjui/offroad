'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { TICKET_STATUSES, TICKET_STATUS_VALUES, type TicketStatus } from '@/lib/tickets'

/**
 * Triage controls, rendered only for an admin. The route re-checks isAdmin
 * server-side — hiding this panel is presentation, not the permission.
 */
export default function TicketAdminPanel({
  ticketId,
  currentStatus,
  currentNote,
}: {
  ticketId: string
  currentStatus: TicketStatus
  currentNote: string | null
}) {
  const tv = useTranslations('ticketVocab')
  const router = useRouter()
  const [status, setStatus] = useState<TicketStatus>(currentStatus)
  const [adminNote, setAdminNote] = useState(currentNote ?? '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    setLoading(true)
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, adminNote: adminNote.trim() || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not update the ticket')
        setLoading(false)
        return
      }
      setSaved(true)
      setLoading(false)
      router.refresh()
    } catch {
      setError('Could not reach the server. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="card mb-6 space-y-3 border-brand-200 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-200">Triage</h2>
      <div className="flex flex-wrap gap-2">
        {TICKET_STATUS_VALUES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            aria-pressed={status === s}
            className={`badge border ${
              status === s ? `${TICKET_STATUSES[s].badgeClass} border-brand-400` : 'border-surface-border bg-surface text-ink-muted'
            }`}
          >
            {tv(`status.${s}`)}
          </button>
        ))}
      </div>
      <textarea
        className="input"
        rows={2}
        value={adminNote}
        onChange={(e) => setAdminNote(e.target.value)}
        maxLength={1000}
        placeholder="Optional note shown on the ticket — why it's declined, what it duplicates, when it shipped…"
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-sm text-green-700 dark:text-green-300">Saved</span>}
      </div>
    </form>
  )
}
