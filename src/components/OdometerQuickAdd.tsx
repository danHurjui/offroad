'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { OVERRIDE_REASONS, type OverrideReason } from '@/lib/odometer'
import { tryFetch } from '@/lib/writeFeedback'
import FormError from './FormError'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

function todayLocal(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

/**
 * RL-044: record what the odometer reads. One number, the date defaulting
 * to today — the entry path is the feature, per the ticket.
 *
 * A reading that breaks date order is refused by the server with the
 * reading it collided with named. Only then are the two exceptions
 * offered, so an override is always a considered second step and never
 * the default.
 */
export default function OdometerQuickAdd({ vehicleId, compact = false }: { vehicleId: string; compact?: boolean }) {
  const t = useTranslations('odometer')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [km, setKm] = useState('')
  const [date, setDate] = useState(todayLocal)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)

  async function save(overrideReason?: OverrideReason) {
    setBusy(true)
    setError(null)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/odometer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ km, readAt: date, note: note || undefined, overrideReason }),
    })
    setBusy(false)
    if (!res?.ok) {
      setConflict(res?.status === 409)
      // A validation answer belongs next to the field, not in a toast.
      setError(await reasonFor(res, t('saveFailed')))
      return
    }
    toast.success(t('saved', { km: Number(km).toLocaleString('ro-RO') }))
    setKm('')
    setNote('')
    setConflict(false)
    router.refresh()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      className="space-y-3"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-32">
          <label className="label" htmlFor={`odometer-km-${vehicleId}`}>{t('kmLabel')}</label>
          <input
            id={`odometer-km-${vehicleId}`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            required
            className="input"
            value={km}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `odometer-error-${vehicleId}` : undefined}
            onChange={(e) => {
              setKm(e.target.value)
              setConflict(false)
            }}
          />
        </div>
        <div className="min-w-0 basis-40">
          <label className="label" htmlFor={`odometer-date-${vehicleId}`}>{t('dateLabel')}</label>
          <input
            id={`odometer-date-${vehicleId}`}
            type="date"
            required
            max={todayLocal()}
            className="input"
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
              setConflict(false)
            }}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={busy || !km}>
          {busy ? t('adding') : t('add')}
        </button>
      </div>
      {!compact && (
        <div>
          <label className="label" htmlFor={`odometer-note-${vehicleId}`}>{t('noteLabel')}</label>
          <input
            id={`odometer-note-${vehicleId}`}
            className="input"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      )}
      <FormError id={`odometer-error-${vehicleId}`}>{error}</FormError>
      {conflict && (
        <div className="note-warn rounded-lg border p-3 text-sm">
          <p className="mb-2 text-ink">{t('overrideAsk')}</p>
          <div className="flex flex-wrap gap-2">
            {OVERRIDE_REASONS.map((reason) => (
              <button key={reason} type="button" className="btn-secondary" disabled={busy} onClick={() => save(reason)}>
                {t(`override.${reason}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  )
}
