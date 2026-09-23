'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PLACE_MAX, PURPOSE_MAX, TRIP_KINDS, type TripKind } from '@/lib/trips'
import { tryFetch } from '@/lib/writeFeedback'
import FormError from './FormError'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

function todayLocal(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/**
 * RL-051: log a trip. The km at each end go into the vehicle's mileage
 * history, so the start is prefilled from the latest reading — the usual
 * case is a trip that starts where the last one ended. A manager of a
 * company vehicle picks who drove it; everyone else is the driver.
 */
export default function TripForm({
  vehicleId,
  lastKm,
  drivers,
  selfId,
}: {
  vehicleId: string
  lastKm: number | null
  /** Organisation members a manager can log a trip for; empty for anyone else. */
  drivers: Array<{ id: string; name: string }>
  selfId: string
}) {
  const t = useTranslations('trips')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [date, setDate] = useState(todayLocal)
  const [fromPlace, setFromPlace] = useState('')
  const [toPlace, setToPlace] = useState('')
  const [purpose, setPurpose] = useState('')
  const [kind, setKind] = useState<TripKind>('BUSINESS')
  const [startKm, setStartKm] = useState(lastKm === null ? '' : String(lastKm))
  const [endKm, setEndKm] = useState('')
  const [driverUserId, setDriverUserId] = useState(selfId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const distance = startKm !== '' && endKm !== '' ? Number(endKm) - Number(startKm) : null

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, fromPlace, toPlace, purpose: purpose || undefined, kind, startKm, endKm, driverUserId }),
    })
    setBusy(false)
    if (!res?.ok) {
      setError(await reasonFor(res, t('saveFailed')))
      return
    }
    toast.success(t('saved'))
    // The next trip usually starts where this one ended.
    setStartKm(endKm)
    setEndKm('')
    setFromPlace(toPlace)
    setToPlace('')
    setPurpose('')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-describedby={error ? 'trip-error' : undefined}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="label" htmlFor="trip-date">{t('date')}</label>
          <input id="trip-date" type="date" required max={todayLocal()} className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {drivers.length > 1 && (
          <div className="min-w-0">
            <label className="label" htmlFor="trip-driver">{t('driver')}</label>
            <select id="trip-driver" className="input" value={driverUserId} onChange={(e) => setDriverUserId(e.target.value)}>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="min-w-0">
          <label className="label" htmlFor="trip-from">{t('from')}</label>
          <input id="trip-from" className="input" required maxLength={PLACE_MAX} value={fromPlace} onChange={(e) => setFromPlace(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="trip-to">{t('to')}</label>
          <input id="trip-to" className="input" required maxLength={PLACE_MAX} value={toPlace} onChange={(e) => setToPlace(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="trip-start">{t('startKm')}</label>
          <input id="trip-start" className="input" type="number" inputMode="numeric" min={0} step={1} required value={startKm} onChange={(e) => setStartKm(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="trip-end">{t('endKm')}</label>
          <input id="trip-end" className="input" type="number" inputMode="numeric" min={startKm || 0} step={1} required value={endKm} onChange={(e) => setEndKm(e.target.value)} />
          {distance !== null && distance >= 0 && <p className="mt-1 text-xs text-ink-muted">{t('distance', { km: distance.toLocaleString('ro-RO') })}</p>}
        </div>
      </div>
      <div className="min-w-0">
        <label className="label" htmlFor="trip-purpose">{t('purpose')}</label>
        <input id="trip-purpose" className="input" maxLength={PURPOSE_MAX} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder={t('purposePlaceholder')} />
      </div>
      <fieldset>
        <legend className="label">{t('kindLabel')}</legend>
        <div className="flex flex-wrap gap-4">
          {TRIP_KINDS.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm text-ink">
              <input type="radio" name="trip-kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
              {t(`kind.${k}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <FormError id="trip-error">{error}</FormError>
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? t('adding') : t('add')}
      </button>
    </form>
  )
}
