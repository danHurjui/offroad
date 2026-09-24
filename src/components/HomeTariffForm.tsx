'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { tryFetch } from '@/lib/writeFeedback'
import FormError from './FormError'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

/**
 * RL-053: the owner's home tariff. It prices home charges entered as kWh
 * alone from now on; charges already recorded keep the total they were
 * given, so changing it rewrites nothing. Blank clears it.
 */
export default function HomeTariffForm({ vehicleId, tariff }: { vehicleId: string; tariff: number | null }) {
  const t = useTranslations('charging')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [value, setValue] = useState(tariff?.toString() ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/charges/tariff`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeTariffRonPerKwh: value }),
    })
    setBusy(false)
    if (!res?.ok) {
      setError(await reasonFor(res, t('tariffFailed')))
      return
    }
    toast.success(value.trim() ? t('tariffSaved') : t('tariffCleared'))
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <label className="label" htmlFor="home-tariff">{t('tariff')}</label>
      <div className="flex flex-wrap items-start gap-2">
        <input
          id="home-tariff"
          type="number"
          inputMode="decimal"
          min={0.0001}
          max={10}
          step={0.0001}
          placeholder="1.20"
          className="input w-40"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-describedby="home-tariff-help"
        />
        <button type="submit" className="btn-secondary" disabled={busy}>
          {t('tariffSave')}
        </button>
      </div>
      <p id="home-tariff-help" className="text-xs text-ink-faint">{t('tariffHelp')}</p>
      <FormError>{error}</FormError>
    </form>
  )
}
