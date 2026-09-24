'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { tryFetch } from '@/lib/writeFeedback'
import FormError from './FormError'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

/**
 * RL-056: the traction-battery warranty, as the owner's paperwork states
 * it — a date, a distance, or both (whichever comes first ends it). No
 * default is offered: the terms vary by car and by market.
 */
export default function BatteryWarrantyForm({
  vehicleId,
  until,
  km,
}: {
  vehicleId: string
  /** YYYY-MM-DD, or null. */
  until: string | null
  km: number | null
}) {
  const t = useTranslations('battery')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [untilValue, setUntil] = useState(until ?? '')
  const [kmValue, setKm] = useState(km?.toString() ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/battery/warranty`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batteryWarrantyUntil: untilValue, batteryWarrantyKm: kmValue }),
    })
    setBusy(false)
    if (!res?.ok) {
      setError(await reasonFor(res, t('warrantyFailed')))
      return
    }
    toast.success(t('warrantySaved'))
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <h2 className="font-semibold text-ink">{t('warrantyTitle')}</h2>
      <p className="text-xs text-ink-faint">{t('warrantyHelp')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="label" htmlFor="warranty-until">{t('warrantyUntil')}</label>
          <input id="warranty-until" type="date" className="input" value={untilValue} onChange={(e) => setUntil(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="warranty-km">{t('warrantyKm')}</label>
          <input
            id="warranty-km"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="160000"
            className="input"
            value={kmValue}
            onChange={(e) => setKm(e.target.value)}
          />
        </div>
      </div>
      <FormError>{error}</FormError>
      <button type="submit" className="btn-secondary" disabled={busy}>
        {t('warrantySave')}
      </button>
    </form>
  )
}
