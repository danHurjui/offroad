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
export interface EditableReading {
  id: string
  sohPercent: number
  source: BatterySource
  /** YYYY-MM-DD */
  date: string
  km: number | null
  note: string | null
}

/**
 * With `reading`, the same form corrects that reading (PATCH) instead of
 * adding one; a report chosen here replaces its file.
 */
export default function BatteryReadingForm({
  vehicleId,
  reading,
  onDone,
}: {
  vehicleId: string
  reading?: EditableReading
  onDone?: () => void
}) {
  const editing = reading !== undefined
  const idp = editing ? `battery-${reading.id}` : 'battery'
  const t = useTranslations('battery')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [soh, setSoh] = useState(reading?.sohPercent.toString() ?? '')
  const [source, setSource] = useState<BatterySource>(reading?.source ?? 'WORKSHOP_TEST')
  const [date, setDate] = useState(reading?.date ?? todayLocal())
  const [km, setKm] = useState(reading?.km?.toString() ?? '')
  const [note, setNote] = useState(reading?.note ?? '')
  const [report, setReport] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await tryFetch(editing ? `/api/vehicles/${vehicleId}/battery/${reading!.id}` : `/api/vehicles/${vehicleId}/battery`, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Blanks are sent as blanks when correcting, so clearing the km or the note clears it.
      body: JSON.stringify({ sohPercent: soh, source, date, km: km || (editing ? '' : undefined), note: note || (editing ? '' : undefined) }),
    })
    if (!res?.ok) {
      setBusy(false)
      setError(await reasonFor(res, t('saveFailed')))
      return
    }
    const saved = await res.json()
    if (report) {
      const form = new FormData()
      form.append('file', await compressImageIfNeeded(report))
      const up = await tryFetch(`/api/vehicles/${vehicleId}/battery/${saved.id}/report`, { method: 'POST', body: form })
      if (!up?.ok) toast.error(await reasonFor(up, t('reportFailed')))
    }
    setBusy(false)
    toast.success(editing ? t('updated') : t('saved'))
    if (editing) {
      onDone?.()
      router.refresh()
      return
    }
    setSoh('')
    setKm('')
    setNote('')
    setReport(null)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {!editing && <h2 className="font-semibold text-ink">{t('addTitle')}</h2>}
      <div>
        <span className="label" id={`${idp}-source-label`}>{t('sourceLabel')}</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={`${idp}-source-label`}>
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
          <label className="label" htmlFor={`${idp}-soh`}>{t('soh')}</label>
          <input
            id={`${idp}-soh`}
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            step={1}
            required
            className="input"
            value={soh}
            onChange={(e) => setSoh(e.target.value)}
            aria-describedby={`${idp}-soh-help`}
          />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor={`${idp}-date`}>{t('date')}</label>
          <input id={`${idp}-date`} type="date" required max={todayLocal()} className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor={`${idp}-km`}>{t('km')}</label>
          <input id={`${idp}-km`} type="number" inputMode="numeric" min={0} step={1} className="input" value={km} onChange={(e) => setKm(e.target.value)} />
        </div>
      </div>
      <p id={`${idp}-soh-help`} className="text-xs text-ink-faint">{t('sohHelp')}</p>
      <details className="text-sm">
        <summary className="cursor-pointer text-brand-600 dark:text-brand-300">{t('moreFields')}</summary>
        <div className="mt-3 space-y-3">
          <div>
            <label className="label" htmlFor={`${idp}-note`}>{t('note')}</label>
            <textarea id={`${idp}-note`} className="input" rows={2} maxLength={BATTERY_NOTE_MAX_LENGTH} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={`${idp}-report`}>{t('report')}</label>
            {report ? (
              <p className="flex flex-wrap items-center gap-2 text-ink">
                <span className="min-w-0 break-all">{t('reportAttached', { name: report.name })}</span>
                <button type="button" className="text-brand-600 hover:underline dark:text-brand-300" onClick={() => setReport(null)}>
                  {t('reportRemove')}
                </button>
              </p>
            ) : (
              <input
                id={`${idp}-report`}
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
        {busy ? t('adding') : editing ? t('saveChanges') : t('add')}
      </button>
      {editing && (
        <button type="button" className="btn-secondary ml-2" onClick={onDone} disabled={busy}>
          {t('cancel')}
        </button>
      )}
    </form>
  )
}
