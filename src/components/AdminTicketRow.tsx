'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TICKET_TYPES, TICKET_STATUSES, TICKET_STATUS_VALUES, type TicketType, type TicketStatus } from '@/lib/tickets'

export type AdminTicketView = {
  id: string
  type: TicketType
  status: TicketStatus
  title: string
  adminNote: string | null
  authorName: string
  authorEmail: string
  authorId: string
  voteCount: number
  commentCount: number
  createdAt: string
  /** The build the reporter's browser said it was running. Untrusted. */
  appVersion: string | null
}

/**
 * One row of the admin ticket list, with triage inline so a backlog can be
 * worked through without opening each ticket. Status changes go through the
 * same PATCH /api/tickets/[id] the detail page uses — there's no separate
 * admin write path to keep in sync.
 */
export default function AdminTicketRow({ ticket }: { ticket: AdminTicketView }) {
  const tc = useTranslations('common')
  const t = useTranslations('admin')
  const tv = useTranslations('ticketVocab')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<TicketStatus>(ticket.status)
  const [note, setNote] = useState(ticket.adminNote ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, adminNote: note.trim() || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? t('updateFailed'))
        setBusy(false)
        return
      }
      setBusy(false)
      setOpen(false)
      router.refresh()
    } catch {
      setError(tc('networkError'))
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${ticket.title}"? Its votes and comments go with it. This cannot be undone.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? t('deleteFailed'))
        setBusy(false)
        return
      }
      router.refresh()
    } catch {
      setError(tc('networkError'))
      setBusy(false)
    }
  }

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className={`badge ${TICKET_TYPES[ticket.type].badgeClass}`}>{tv(`type.${ticket.type}.label`)}</span>
            <span className={`badge ${TICKET_STATUSES[ticket.status].badgeClass}`}>
              {tv(`status.${ticket.status}`)}
            </span>
            <span className="text-xs text-ink-faint">
              {ticket.voteCount} vote{ticket.voteCount === 1 ? '' : 's'} · {ticket.commentCount} comment
              {ticket.commentCount === 1 ? '' : 's'}
            </span>
          </div>
          <Link href={`/tickets/${ticket.id}`} className="font-medium text-ink hover:text-brand-600 dark:hover:text-brand-300">
            {ticket.title}
          </Link>
          <div className="text-xs text-ink-faint">
            <Link href={`/admin/users/${ticket.authorId}`} className="hover:text-brand-600 dark:hover:text-brand-300">
              {ticket.authorName}
            </Link>{' '}
            · {ticket.authorEmail} · {new Date(ticket.createdAt).toLocaleDateString('ro-RO')}
            {/* Labelled as reported rather than stated as fact: it comes
                from the reporter's browser, which is the only thing that
                knows it and also the one thing here nobody verified. */}
            {ticket.appVersion && (
              <> · <span title={t('reportedVersion')} className="font-mono">{ticket.appVersion}</span></>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn-secondary py-1 text-xs" onClick={() => setOpen(!open)} disabled={busy}>
            {open ? tc('cancel') : t('triage')}
          </button>
          <button type="button" className="btn-danger py-1 text-xs" onClick={remove} disabled={busy}>
            {tc('delete')}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 rounded-lg border border-surface-border bg-surface-muted p-3">
          <div className="mb-2 flex flex-wrap gap-2">
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
            className="input" rows={2} value={note} maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('triageNotePlaceholder')}
          />
          <div className="mt-2 flex items-center gap-3">
            <button type="button" className="btn-primary py-1 text-xs" onClick={save} disabled={busy}>
              {busy ? tc('saving') : tc('save')}
            </button>
            {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
          </div>
        </div>
      )}

      {!open && error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
