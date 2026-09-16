'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { TICKET_COMMENT_MAX } from '@/lib/tickets'

export type TicketCommentView = {
  id: string
  body: string
  isStaff: boolean
  authorName: string
  createdAt: string
}

export default function TicketComments({
  ticketId,
  comments,
  signedIn,
}: {
  ticketId: string
  comments: TicketCommentView[]
  signedIn: boolean
}) {
  const t = useTranslations('tickets')
  const tc = useTranslations('common')
  const router = useRouter()
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? t('postFailed'))
        setLoading(false)
        return
      }
      setBody('')
      setLoading(false)
      router.refresh()
    } catch {
      setError(tc('networkError'))
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
        {comments.length === 0 ? t('comments') : t('commentCount', { count: comments.length })}
      </h2>

      {comments.length > 0 && (
        <ul className="mb-5 space-y-3">
          {comments.map((c) => (
            <li key={c.id} className={`card p-4 ${c.isStaff ? 'note' : ''}`}>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink">{c.authorName}</span>
                {c.isStaff && <span className="badge badge-brand">RigLog</span>}
                <span className="text-xs text-ink-faint">
                  {new Date(c.createdAt).toLocaleDateString('ro-RO')}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-ink-muted">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      {signedIn ? (
        <form onSubmit={onSubmit} className="card space-y-3 p-4">
          <textarea
            id="ticket-comment"
            name="ticket-comment"
            // Placeholder-only fields have no accessible name once the
            // placeholder disappears on the first keystroke.
            aria-label={t('addComment')}
            className="input"
            rows={3}
            autoCapitalize="sentences"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={TICKET_COMMENT_MAX}
            placeholder={t('commentPlaceholder')}
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-faint">
              {body.length}/{TICKET_COMMENT_MAX}
            </span>
            <button type="submit" className="btn-primary" disabled={loading || !body.trim()}>
              {loading ? t('posting') : t('comment')}
            </button>
          </div>
        </form>
      ) : (
        <p className="card p-4 text-sm text-ink-muted">
          {t.rich('logInToComment', {
            login: (chunks) => (
              <a
                href={`/login?callbackUrl=${encodeURIComponent(`/tickets/${ticketId}`)}`}
                className="text-brand-600 dark:text-brand-300 hover:underline"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      )}
    </div>
  )
}
