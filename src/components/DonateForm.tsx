'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  DONATION_PRESETS_RON,
  DONATION_MESSAGE_MAX,
  MIN_DONATION_BANI,
  MAX_DONATION_BANI,
  baniToRon,
} from '@/lib/donations'

export default function DonateForm({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations('donate')
  const tc = useTranslations('common')
  const [preset, setPreset] = useState<number | null>(DONATION_PRESETS_RON[1])
  const [custom, setCustom] = useState('')
  const [message, setMessage] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const amountRon = preset ?? Number(custom)
  const valid =
    Number.isFinite(amountRon) &&
    amountRon * 100 >= MIN_DONATION_BANI &&
    amountRon * 100 <= MAX_DONATION_BANI

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!valid) {
      setError(
        `Enter an amount between ${baniToRon(MIN_DONATION_BANI)} and ${baniToRon(MAX_DONATION_BANI)} RON`
      )
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/donations/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountRon, message: message || undefined, isAnonymous }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) {
        setError(data.error ?? t('checkoutFailed'))
        setLoading(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError(tc('networkError'))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6">
      <div>
        <label className="label">{t('amount')}</label>
        <div className="grid grid-cols-4 gap-2">
          {DONATION_PRESETS_RON.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={preset === value}
              onClick={() => {
                setPreset(value)
                setCustom('')
              }}
              className={`rounded-lg border-2 px-2 py-3 text-sm font-semibold transition-colors ${
                preset === value ? 'border-brand-500 bg-brand-50 dark:bg-brand-400/10 text-ink' : 'border-surface-border text-ink-muted'
              }`}
            >
              {value} RON
            </button>
          ))}
        </div>
        <div className="mt-3">
          <label className="label" htmlFor="custom-amount">
            {t('otherAmount')}
          </label>
          <input
            id="custom-amount"
            className="input"
            type="number"
            min={baniToRon(MIN_DONATION_BANI)}
            max={baniToRon(MAX_DONATION_BANI)}
            step="1"
            inputMode="decimal"
            placeholder={t('otherPlaceholder')}
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value)
              setPreset(null)
            }}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="donate-message">
          {t('message')}
        </label>
        <textarea
          id="donate-message"
          className="input"
          rows={2}
          maxLength={DONATION_MESSAGE_MAX}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('messagePlaceholder')}
        />
        <p className="mt-1 text-xs text-ink-faint">
          {message.length}/{DONATION_MESSAGE_MAX}
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm text-ink-muted">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={isAnonymous}
          onChange={(e) => setIsAnonymous(e.target.checked)}
        />
        <span>
          {t('anonymous')}
          {!signedIn && t('anonymousAlready')}
        </span>
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button type="submit" className="btn-primary w-full py-3 text-base" disabled={loading || !valid}>
        {loading
          ? t('redirecting')
          : valid
            ? t('donateAmount', { amount: amountRon })
            : t('donateNoAmount')}
      </button>

      <p className="text-center text-xs text-ink-faint">
        {t('stripeNote')}
      </p>
    </form>
  )
}
