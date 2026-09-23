'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { TYRE_SEASONS } from '@/lib/tyres'
import { tryFetch } from '@/lib/writeFeedback'
import FormError from './FormError'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

/** RL-050: add a tyre set. Only the season is required. */
export default function TyreSetForm({ vehicleId, hasFitted }: { vehicleId: string; hasFitted: boolean }) {
  const t = useTranslations('tyres')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const empty = { season: 'SUMMER', label: '', size: '', dotYear: '', treadDepthMm: '', fittedAt: '', fittedKm: '' }
  const [form, setForm] = useState(empty)
  // The first set anybody adds is almost always the one on the car.
  const [isFitted, setIsFitted] = useState(!hasFitted)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<typeof empty>) => setForm({ ...form, ...patch })

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/tyres`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, isFitted }),
    })
    setBusy(false)
    if (!res?.ok) {
      setError(await reasonFor(res, t('saveFailed')))
      return
    }
    toast.success(t('saved'))
    setForm(empty)
    setIsFitted(false)
    router.refresh()
  }

  const field = (id: keyof typeof empty, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="min-w-0">
      <label className="label" htmlFor={`tyre-${id}`}>{label}</label>
      <input id={`tyre-${id}`} className="input" value={form[id]} onChange={(e) => set({ [id]: e.target.value })} {...extra} />
    </div>
  )

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="label" htmlFor="tyre-season">{t('seasonLabel')}</label>
          <select id="tyre-season" className="input" value={form.season} onChange={(e) => set({ season: e.target.value })}>
            {TYRE_SEASONS.map((s) => (
              <option key={s} value={s}>{t(`season.${s}`)}</option>
            ))}
          </select>
        </div>
        {field('label', t('label'), { placeholder: t('labelPlaceholder'), maxLength: 80 })}
        {field('size', t('size'), { placeholder: t('sizePlaceholder'), maxLength: 20 })}
        <div className="min-w-0">
          {field('dotYear', t('dotYear'), { type: 'number', inputMode: 'numeric', min: 1970, max: new Date().getFullYear() + 1, 'aria-describedby': 'tyre-dot-help' })}
          <p id="tyre-dot-help" className="mt-1 text-xs text-ink-faint">{t('dotHelp')}</p>
        </div>
        {field('treadDepthMm', t('tread'), { type: 'number', inputMode: 'decimal', min: 0, max: 20, step: 0.1 })}
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={isFitted} onChange={(e) => setIsFitted(e.target.checked)} />
        {t('fitted')}
      </label>
      {isFitted && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field('fittedAt', t('fittedAt'), { type: 'date', max: new Date().toISOString().slice(0, 10) })}
          {field('fittedKm', t('fittedKm'), { type: 'number', inputMode: 'numeric', min: 0, step: 1 })}
        </div>
      )}
      <FormError>{error}</FormError>
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? t('adding') : t('add')}
      </button>
    </form>
  )
}
