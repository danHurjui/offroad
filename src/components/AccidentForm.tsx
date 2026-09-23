'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ACCIDENT_KINDS, DESCRIPTION_MAX, INSURANCE_ROUTES } from '@/lib/accidents'
import { tryFetch } from '@/lib/writeFeedback'
import FormError from './FormError'
import MoneyInput from './MoneyInput'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

/** RL-050: record an accident or damage. Date, kind and description are required. */
export default function AccidentForm({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('accidents')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const today = new Date().toISOString().slice(0, 10)
  const empty = { date: today, kind: 'COLLISION', description: '', km: '', insurance: '', repairedAt: '', repairCostRon: '' }
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<typeof empty>) => setForm({ ...form, ...patch })

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/accidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setBusy(false)
    if (!res?.ok) {
      setError(await reasonFor(res, t('saveFailed')))
      return
    }
    toast.success(t('saved'))
    setForm(empty)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="label" htmlFor="accident-date">{t('date')}</label>
          <input id="accident-date" type="date" required max={today} className="input" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="accident-kind">{t('kindLabel')}</label>
          <select id="accident-kind" className="input" value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
            {ACCIDENT_KINDS.map((k) => (
              <option key={k} value={k}>{t(`kind.${k}`)}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="accident-description">{t('description')}</label>
        <textarea
          id="accident-description"
          required
          rows={3}
          maxLength={DESCRIPTION_MAX}
          className="input"
          placeholder={t('descriptionPlaceholder')}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="label" htmlFor="accident-km">{t('km')}</label>
          <input id="accident-km" type="number" inputMode="numeric" min={0} step={1} className="input" value={form.km} onChange={(e) => set({ km: e.target.value })} />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="accident-insurance">{t('insuranceLabel')}</label>
          <select id="accident-insurance" className="input" value={form.insurance} onChange={(e) => set({ insurance: e.target.value })}>
            <option value="">{t('insuranceUnknown')}</option>
            {INSURANCE_ROUTES.map((r) => (
              <option key={r} value={r}>{t(`insurance.${r}`)}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="accident-repairedAt">{t('repairedAt')}</label>
          <input
            id="accident-repairedAt"
            type="date"
            min={form.date}
            max={today}
            className="input"
            value={form.repairedAt}
            onChange={(e) => set({ repairedAt: e.target.value })}
          />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="accident-repairCostRon">{t('repairCost')}</label>
          <MoneyInput id="accident-repairCostRon" value={form.repairCostRon} onChange={(repairCostRon) => set({ repairCostRon })} describedBy="accident-cost-help" />
          <p id="accident-cost-help" className="mt-1 text-xs text-ink-faint">{t('repairCostHelp')}</p>
        </div>
      </div>
      <FormError>{error}</FormError>
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? t('adding') : t('add')}
      </button>
    </form>
  )
}
