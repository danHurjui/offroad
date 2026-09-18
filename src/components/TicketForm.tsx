'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { TICKET_TYPE_VALUES, TICKET_TITLE_MAX, TICKET_DESCRIPTION_MAX, type TicketType } from '@/lib/tickets'
import { versionLabel } from '@/lib/version'

import FormError from './FormError'

export default function TicketForm() {
  const t = useTranslations('tickets')
  const tc = useTranslations('common')
  const tv = useTranslations('ticketVocab')
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
        // Sent from the browser because only the browser knows it: a
        // service worker can be serving this person a bundle from several
        // deploys ago while the server answers as the current one. That
        // gap is the first thing worth knowing about "this button does
        // nothing".
        body: JSON.stringify({ type, title, description, appVersion: versionLabel() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? t('submitFailed'))
        setLoading(false)
        return
      }
      router.push(`/tickets/${data.id}`)
      router.refresh()
    } catch {
      setError(tc('networkError'))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6">
      <div>
        <label className="label">{t('whatKind')}</label>
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
              <div className="font-semibold text-ink">{tv(`type.${t}.label`)}</div>
              <div className="text-xs text-ink-muted">{tv(`type.${t}.blurb`)}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="ticket-title">
          {t('ticketTitle')}
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
          placeholder={t('titlePlaceholder')}
        />
        <p className="mt-1 text-xs text-ink-faint">
          {title.length}/{TICKET_TITLE_MAX}
        </p>
      </div>

      <div>
        <label className="label" htmlFor="ticket-description">
          {t('details')}
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
          placeholder={t(`placeholder.${type}`)}
        />
        <p className="mt-1 text-xs text-ink-faint">
          {description.length}/{TICKET_DESCRIPTION_MAX}
        </p>
      </div>

      <FormError>{error}</FormError>

      <div className="flex gap-3">
        <button type="submit" className="btn-primary" disabled={loading || !title.trim() || !description.trim()}>
          {loading ? t('posting') : t('postTicket')}
        </button>
        <button type="button" className="btn-secondary" onClick={() => router.back()}>
          {tc('cancel')}
        </button>
      </div>

      <p className="text-xs text-ink-faint">
        Tickets are public — anyone can read, vote and comment. Don&apos;t include passwords, personal
        details or anything you wouldn&apos;t post in a forum.
      </p>
    </form>
  )
}
