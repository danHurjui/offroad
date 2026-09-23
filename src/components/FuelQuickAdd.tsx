'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { compressImageIfNeeded } from '@/lib/compressImage'
import { readAnything, type FieldState } from '@/lib/receiptParse'
import type { ScanProgress } from '@/lib/ocr'
import { tryFetch } from '@/lib/writeFeedback'
import FormError from './FormError'
import MoneyInput from './MoneyInput'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

function todayLocal(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/**
 * RL-044: a fill-up in three numbers — lei, litres, km — with "filled to
 * full" on by default. The ticket's warning is the design brief: "anything
 * that takes a form and four fields will be used twice". Date, station and
 * the receipt photo sit behind "More details", defaulting to today.
 *
 * The receipt uploads after the entry is saved, like a task receipt: a
 * rejected file (over 4MB, say) reports itself without losing the numbers.
 *
 * RL-048: "Scan a receipt" reads the photo on the device and **proposes**
 * the figures — it fills the form and never submits it. A field read with
 * low confidence stays empty with a flag; a scan that reads nothing says
 * so and leaves the photo attached, so the manual form is never a dead end.
 */
type ScanField = 'totalRon' | 'litres' | 'date' | 'station'

export default function FuelQuickAdd({
  vehicleId,
  canScan = false,
  offerScanUpgrade = false,
}: {
  vehicleId: string
  /** Pro (the vehicle's account of record). */
  canScan?: boolean
  /** Point an owner without Pro at the upgrade page instead. */
  offerScanUpgrade?: boolean
}) {
  const t = useTranslations('fuel')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [totalRon, setTotalRon] = useState('')
  const [litres, setLitres] = useState('')
  const [km, setKm] = useState('')
  const [isFullTank, setIsFullTank] = useState(true)
  const [date, setDate] = useState(todayLocal)
  const [station, setStation] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [scanOutcome, setScanOutcome] = useState<'read' | 'failed' | null>(null)
  const [scanStates, setScanStates] = useState<Partial<Record<ScanField, FieldState>>>({})

  async function onScan(file: File) {
    setReceipt(file)
    setScanOutcome(null)
    setScanStates({})
    setScanProgress({ pass: 1, fraction: 0 })
    try {
      const { scanFuelReceipt } = await import('@/lib/ocr')
      const proposal = await scanFuelReceipt(file, setScanProgress)
      if (!readAnything(proposal)) throw new Error('nothing read')
      // What was read is written in; what was read badly is cleared, so an
      // earlier figure (a previous scan's, say) can't pass for this
      // receipt's; what the receipt doesn't show keeps what was typed.
      const apply = (f: { value: string | number | null; state: FieldState }, set: (v: string) => void) => {
        if (f.value !== null) set(String(f.value))
        else if (f.state === 'unsure') set('')
      }
      apply(proposal.totalRon, setTotalRon)
      apply(proposal.litres, setLitres)
      apply(proposal.station, setStation)
      // The date always has a value (today); a doubtful read keeps it and says so.
      if (proposal.date.value !== null) setDate(proposal.date.value)
      setScanStates({
        totalRon: proposal.totalRon.state,
        litres: proposal.litres.state,
        date: proposal.date.state,
        station: proposal.station.state,
      })
      setScanOutcome('read')
    } catch {
      setScanOutcome('failed')
    } finally {
      setScanProgress(null)
      setMoreOpen(true)
    }
  }

  /** The flag under a field the scan could not read with confidence. */
  function unsureNote(field: ScanField, value: string) {
    if (scanStates[field] !== 'unsure' || value !== '') return null
    return (
      <p id={`fuel-${field}-unsure`} className="note-warn mt-1 rounded border px-2 py-1 text-xs text-ink">
        {t('scanUnsure')}
      </p>
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/fuel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalRon, litres, km: km || undefined, isFullTank, date, station: station || undefined }),
    })
    if (!res?.ok) {
      setBusy(false)
      setError(await reasonFor(res, t('saveFailed')))
      return
    }
    const entry = await res.json()
    if (receipt) {
      const form = new FormData()
      form.append('file', await compressImageIfNeeded(receipt))
      const up = await tryFetch(`/api/vehicles/${vehicleId}/fuel/${entry.id}/receipt`, { method: 'POST', body: form })
      if (!up?.ok) toast.error(await reasonFor(up, t('receiptFailed')))
    }
    setBusy(false)
    toast.success(t('saved'))
    setTotalRon('')
    setLitres('')
    setKm('')
    setStation('')
    setReceipt(null)
    setIsFullTank(true)
    setScanOutcome(null)
    setScanStates({})
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {canScan && (
        <div>
          <label className="btn-secondary inline-flex cursor-pointer items-center focus-within:ring-2 focus-within:ring-brand-500">
            {scanProgress === null
              ? t('scan')
              : t(scanProgress.pass === 1 ? 'scanning' : 'scanningAgain', { percent: Math.round(scanProgress.fraction * 100) })}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-describedby="fuel-scan-help"
              disabled={scanProgress !== null}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void onScan(file)
              }}
            />
          </label>
          <p id="fuel-scan-help" className="mt-1 text-xs text-ink-faint">{t('scanHelp')}</p>
          <div aria-live="polite">
            {scanOutcome === 'read' && <p className="note-warn mt-2 rounded-lg border p-3 text-sm">{t('scanRead')}</p>}
            {scanOutcome === 'failed' && <p className="note-warn mt-2 rounded-lg border p-3 text-sm">{t('scanFailed')}</p>}
          </div>
        </div>
      )}
      {!canScan && offerScanUpgrade && (
        <p className="text-xs text-ink-faint">
          <Link href="/dashboard/upgrade" className="text-brand-600 hover:underline dark:text-brand-300">
            {t('scanPro')}
          </Link>
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="min-w-0">
          <label className="label" htmlFor="fuel-total">{t('totalRon')}</label>
          <MoneyInput
            id="fuel-total"
            value={totalRon}
            onChange={setTotalRon}
            required
            describedBy={scanStates.totalRon === 'unsure' ? 'fuel-totalRon-unsure' : undefined}
          />
          {unsureNote('totalRon', totalRon)}
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="fuel-litres">{t('litres')}</label>
          <input
            id="fuel-litres"
            type="number"
            inputMode="decimal"
            min={0.01}
            step={0.01}
            required
            className="input"
            value={litres}
            onChange={(e) => setLitres(e.target.value)}
            aria-describedby={scanStates.litres === 'unsure' ? 'fuel-litres-unsure' : undefined}
          />
          {unsureNote('litres', litres)}
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="fuel-km">{t('km')}</label>
          <input
            id="fuel-km"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className="input"
            value={km}
            onChange={(e) => setKm(e.target.value)}
          />
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" className="mt-0.5" checked={isFullTank} onChange={(e) => setIsFullTank(e.target.checked)} aria-describedby="fuel-full-help" />
        <span>
          {t('fullTank')}
          <span id="fuel-full-help" className="block text-xs text-ink-faint">{t('fullTankHelp')}</span>
        </span>
      </label>
      <details className="text-sm" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer text-brand-600 dark:text-brand-300">{t('moreFields')}</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="label" htmlFor="fuel-date">{t('date')}</label>
            <input id="fuel-date" type="date" required max={todayLocal()} className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            {scanStates.date === 'unsure' && <p className="note-warn mt-1 rounded border px-2 py-1 text-xs text-ink">{t('scanUnsureDate')}</p>}
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="fuel-station">{t('station')}</label>
            <input
              id="fuel-station"
              className="input"
              maxLength={80}
              value={station}
              onChange={(e) => setStation(e.target.value)}
              aria-describedby={scanStates.station === 'unsure' ? 'fuel-station-unsure' : undefined}
            />
            {unsureNote('station', station)}
          </div>
          <div className="min-w-0 sm:col-span-2">
            <label className="label" htmlFor="fuel-receipt">{t('receipt')}</label>
            {receipt ? (
              <p className="flex flex-wrap items-center gap-2 text-ink">
                <span className="min-w-0 break-all">{t('receiptAttached', { name: receipt.name })}</span>
                <button type="button" className="text-brand-600 hover:underline dark:text-brand-300" onClick={() => setReceipt(null)}>
                  {t('receiptRemove')}
                </button>
              </p>
            ) : (
              <input
                id="fuel-receipt"
                type="file"
                accept="image/jpeg,image/png,image/heic,application/pdf"
                className="input"
                onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
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
