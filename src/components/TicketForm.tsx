'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  TICKET_TYPES,
  TICKET_TYPE_VALUES,
  TICKET_TITLE_MAX,
  TICKET_DESCRIPTION_MAX,
  type TicketType,
} from '@/lib/tickets'

const PLACEHOLDERS: Record<TicketType, string> = {
  BUG: 'What did you do, what did you expect, and what happened instead? Which vehicle/screen, and on phone or desktop?',
  FEATURE: 'What would you like to be able to do, and what are you trying to achieve by it?',
  IMPROVEMENT: 'What works today but could work better, and what makes it awkward right now?',
}

import FormError from './FormError'

export default function TicketForm() {
  const router = useRouter()
  const [type, setType] = useState<TicketType>('BUG')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, title, description }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not create the ticket')
        setLoading(false)
        return
      }
      router.push(`/tickets/${data.id}`)
      router.refresh()
    } catch {
      setError('Could not reach the server. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6">
      <div>
        <label className="label">What kind of ticket is this?</label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {TICKET_TYPE_VALUES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={`rounded-xl border-2 p-3 text-left transition-colors ${
                type === t ? 'border-brand-500 bg-brand-50 dark:bg-brand-400/10' : 'border-surface-border'
              }`}
            >
              <div className="font-semibold text-ink">{TICKET_TYPES[t].label}</div>
              <div className="text-xs text-ink-muted">{TICKET_TYPES[t].blurb}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="ticket-title">
          Title
        </label>
        <input
          id="ticket-title"
          name="ticket-title"
          className="input"
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="next"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TICKET_TITLE_MAX}
          required
          placeholder="One line summarising it"
        />
        <p className="mt-1 text-xs text-ink-faint">
          {title.length}/{TICKET_TITLE_MAX}
        </p>
      </div>

      <div>
        <label className="label" htmlFor="ticket-description">
          Details
        </label>
        <textarea
          id="ticket-description"
          name="ticket-description"
          className="input"
          autoCapitalize="sentences"
          rows={7}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={TICKET_DESCRIPTION_MAX}
          required
          placeholder={PLACEHOLDERS[type]}
        />
        <p className="mt-1 text-xs text-ink-faint">
          {description.length}/{TICKET_DESCRIPTION_MAX}
        </p>
      </div>

      <FormError>{error}</FormError>

      <div className="flex gap-3">
        <button type="submit" className="btn-primary" disabled={loading || !title.trim() || !description.trim()}>
          {loading ? 'Posting…' : 'Post ticket'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => router.back()}>
          Cancel
        </button>
      </div>

      <p className="text-xs text-ink-faint">
        Tickets are public — anyone can read, vote and comment. Don&apos;t include passwords, personal
        details or anything you wouldn&apos;t post in a forum.
      </p>
    </form>
  )
}
