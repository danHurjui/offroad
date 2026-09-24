'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { compressImageIfNeeded } from '@/lib/compressImage'
import { CHARGE_LOCATIONS, type ChargeLocation } from '@/lib/charging'
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
 * RL-053: a charge in a few numbers — lei, kWh, km and where — the fill-up
 * form's shape (FuelQuickAdd). The rest (date, network, battery % before
 * and after, receipt) sits behind "More details", defaulting to today.
 *
 * With a home tariff set, a home charge can leave the total blank: the
 * server works it out from the tariff and the entry says so. The field
 * says that it will, so an empty total never looks like a mistake.
 */
export interface EditableCharge {
  id: string
  /** Null when this viewer does not see costs, or it was priced from the tariff. */
  totalRon: number | null
  totalFromTariff: boolean
  kwh: number | null
  km: number | null
  location: ChargeLocation
  /** YYYY-MM-DD */
  date: string
  network: string | null
  socFrom: number | null
  socTo: number | null
}

/**
 * With `entry`, the same form corrects that charge (PATCH). A total left
 * blank by someone who does not see costs keeps the stored one; a
 * tariff-priced home charge starts blank and is priced again from the
 * tariff unless a total is typed.
 */
export default function ChargeQuickAdd({
  vehicleId,
  hasHomeTariff,
  entry,
  hideCosts = false,
  onDone,
}: {
  vehicleId: string
  /** The owner has set a home tariff (its value may be hidden from this viewer). */
  hasHomeTariff: boolean
  entry?: EditableCharge
  hideCosts?: boolean
  onDone?: () => void
}) {
  const editing = entry !== undefined
  const idp = editing ? `charge-${entry.id}` : 'charge'
  const t = useTranslations('charging')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [totalRon, setTotalRon] = useState(entry && !entry.totalFromTariff && entry.totalRon !== null ? String(entry.totalRon) : '')
  const [kwh, setKwh] = useState(entry?.kwh?.toString() ?? '')
  const [km, setKm] = useState(entry?.km?.toString() ?? '')
  const [location, setLocation] = useState<ChargeLocation>(entry?.location ?? 'HOME')
  const [date, setDate] = useState(entry?.date ?? todayLocal())
  const [network, setNetwork] = useState(entry?.network ?? '')
  const [socFrom, setSocFrom] = useState(entry?.socFrom?.toString() ?? '')
  const [socTo, setSocTo] = useState(entry?.socTo?.toString() ?? '')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tariffCanPrice = hasHomeTariff && location === 'HOME'
  // Someone who does not see costs leaves the total as recorded.
  const totalKept = editing && hideCosts

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // When correcting, blanks are sent as blanks, so clearing a field clears it.
    const blank = editing ? '' : undefined
    const res = await tryFetch(editing ? `/api/vehicles/${vehicleId}/charges/${entry!.id}` : `/api/vehicles/${vehicleId}/charges`, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalRon: totalRon || blank,
        kwh: kwh || blank,
        km: km || blank,
        location,
        date,
        network: network || blank,
        socFrom: socFrom || blank,
        socTo: socTo || blank,
      }),
    })
    if (!res?.ok) {
      setBusy(false)
      setError(await reasonFor(res, t('saveFailed')))
      return
    }
    const saved = await res.json()
    if (receipt) {
      const form = new FormData()
      form.append('file', await compressImageIfNeeded(receipt))
      const up = await tryFetch(`/api/vehicles/${vehicleId}/charges/${saved.id}/receipt`, { method: 'POST', body: form })
      if (!up?.ok) toast.error(await reasonFor(up, t('receiptFailed')))
    }
    setBusy(false)
    toast.success(editing ? t('updated') : t('saved'))
    if (editing) {
      onDone?.()
      router.refresh()
      return
    }
    setTotalRon('')
    setKwh('')
    setKm('')
    setNetwork('')
    setSocFrom('')
    setSocTo('')
    setReceipt(null)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <span className="label" id={`${idp}-location-label`}>{t('location')}</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={`${idp}-location-label`}>
          {CHARGE_LOCATIONS.map((code) => (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={location === code}
              className={`chip ${location === code ? 'chip-on' : ''}`}
              onClick={() => setLocation(code)}
            >
              {t(`where.${code}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="min-w-0">
          <label className="label" htmlFor={`${idp}-total`}>{t('totalRon')}</label>
          <MoneyInput
            id={`${idp}-total`}
            value={totalRon}
            onChange={setTotalRon}
            required={!tariffCanPrice && !totalKept}
            describedBy={`${idp}-total-help`}
          />
          <p id={`${idp}-total-help`} className="mt-1 text-xs text-ink-faint">
            {totalKept ? t('totalKeptHelp') : tariffCanPrice ? t('totalFromTariffHelp') : t('totalHelp')}
          </p>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor={`${idp}-kwh`}>{t('kwh')}</label>
          <input
            id={`${idp}-kwh`}
            type="number"
            inputMode="decimal"
            min={0.01}
            step={0.01}
            required={tariffCanPrice && totalRon === ''}
            className="input"
            value={kwh}
            onChange={(e) => setKwh(e.target.value)}
            aria-describedby={`${idp}-kwh-help`}
          />
          <p id={`${idp}-kwh-help`} className="mt-1 text-xs text-ink-faint">{t('kwhHelp')}</p>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor={`${idp}-km`}>{t('km')}</label>
          <input
            id={`${idp}-km`}
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
      <details className="text-sm">
        <summary className="cursor-pointer text-brand-600 dark:text-brand-300">{t('moreFields')}</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="label" htmlFor={`${idp}-date`}>{t('date')}</label>
            <input id={`${idp}-date`} type="date" required max={todayLocal()} className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor={`${idp}-network`}>{t('network')}</label>
            <input id={`${idp}-network`} className="input" maxLength={80} value={network} onChange={(e) => setNetwork(e.target.value)} />
          </div>
          <fieldset className="min-w-0 sm:col-span-2">
            <legend className="label">{t('soc')}</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-faint" htmlFor={`${idp}-soc-from`}>{t('socFrom')}</label>
                <input id={`${idp}-soc-from`} type="number" inputMode="numeric" min={0} max={99} step={1} className="input" value={socFrom} onChange={(e) => setSocFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-ink-faint" htmlFor={`${idp}-soc-to`}>{t('socTo')}</label>
                <input id={`${idp}-soc-to`} type="number" inputMode="numeric" min={1} max={100} step={1} className="input" value={socTo} onChange={(e) => setSocTo(e.target.value)} />
              </div>
            </div>
            <p className="mt-1 text-xs text-ink-faint">{t('socHelp')}</p>
          </fieldset>
          <div className="min-w-0 sm:col-span-2">
            <label className="label" htmlFor={`${idp}-receipt`}>{t('receipt')}</label>
            {receipt ? (
              <p className="flex flex-wrap items-center gap-2 text-ink">
                <span className="min-w-0 break-all">{t('receiptAttached', { name: receipt.name })}</span>
                <button type="button" className="text-brand-600 hover:underline dark:text-brand-300" onClick={() => setReceipt(null)}>
                  {t('receiptRemove')}
                </button>
              </p>
            ) : (
              <input
                id={`${idp}-receipt`}
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
