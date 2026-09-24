'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { compressImageIfNeeded } from '@/lib/compressImage'
import { BATTERY_NOTE_MAX_LENGTH, BATTERY_SOURCES, type BatterySource } from '@/lib/batteryHealth'
import { tryFetch } from '@/lib/writeFeedback'
import FormError from './FormError'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

function todayLocal(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/**
 * RL-056: a state-of-health reading as it was given — the figure, where it
 * came from, the day of the test and, optionally, the km and the report.
 * The source is asked every time because figures from a workshop test and
 * from the car's own display are not the same measurement.
 */
export default function BatteryReadingForm({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('battery')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [soh, setSoh] = useState('')
  const [source, setSource] = useState<BatterySource>('WORKSHOP_TEST')
  const [date, setDate] = useState(todayLocal)
  const [km, setKm] = useState('')
  const [note, setNote] = useState('')
  const [report, setReport] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/battery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sohPercent: soh, source, date, km: km || undefined, note: note || undefined }),
    })
    if (!res?.ok) {
      setBusy(false)
      setError(await reasonFor(res, t('saveFailed')))
      return
    }
    const reading = await res.json()
    if (report) {
      const form = new FormData()
      form.append('file', await compressImageIfNeeded(report))
      const up = await tryFetch(`/api/vehicles/${vehicleId}/battery/${reading.id}/report`, { method: 'POST', body: form })
      if (!up?.ok) toast.error(await reasonFor(up, t('reportFailed')))
    }
    setBusy(false)
    toast.success(t('saved'))
    setSoh('')
    setKm('')
    setNote('')
    setReport(null)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <h2 className="font-semibold text-ink">{t('addTitle')}</h2>
      <div>
        <span className="label" id="battery-source-label">{t('sourceLabel')}</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="battery-source-label">
          {BATTERY_SOURCES.map((code) => (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={source === code}
              className={`chip ${source === code ? 'chip-on' : ''}`}
              onClick={() => setSource(code)}
            >
              {t(`source.${code}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="min-w-0">
          <label className="label" htmlFor="battery-soh">{t('soh')}</label>
          <input
            id="battery-soh"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            step={1}
            required
            className="input"
            value={soh}
            onChange={(e) => setSoh(e.target.value)}
            aria-describedby="battery-soh-help"
          />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="battery-date">{t('date')}</label>
          <input id="battery-date" type="date" required max={todayLocal()} className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="battery-km">{t('km')}</label>
          <input id="battery-km" type="number" inputMode="numeric" min={0} step={1} className="input" value={km} onChange={(e) => setKm(e.target.value)} />
        </div>
      </div>
      <p id="battery-soh-help" className="text-xs text-ink-faint">{t('sohHelp')}</p>
      <details className="text-sm">
        <summary className="cursor-pointer text-brand-600 dark:text-brand-300">{t('moreFields')}</summary>
        <div className="mt-3 space-y-3">
          <div>
            <label className="label" htmlFor="battery-note">{t('note')}</label>
            <textarea id="battery-note" className="input" rows={2} maxLength={BATTERY_NOTE_MAX_LENGTH} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="battery-report">{t('report')}</label>
            {report ? (
              <p className="flex flex-wrap items-center gap-2 text-ink">
                <span className="min-w-0 break-all">{t('reportAttached', { name: report.name })}</span>
                <button type="button" className="text-brand-600 hover:underline dark:text-brand-300" onClick={() => setReport(null)}>
                  {t('reportRemove')}
                </button>
              </p>
            ) : (
              <input
                id="battery-report"
                type="file"
                accept="image/jpeg,image/png,image/heic,application/pdf"
                className="input"
                onChange={(e) => setReport(e.target.files?.[0] ?? null)}
              />
            )}
          </div>
        </div>
      </details>
      <FormError>{error}</FormError>
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? t('adding') : t('add')}
      </button>
    </form>
  )
}
