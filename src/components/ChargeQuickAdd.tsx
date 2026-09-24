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
export default function ChargeQuickAdd({
  vehicleId,
  hasHomeTariff,
}: {
  vehicleId: string
  /** The owner has set a home tariff (its value may be hidden from this viewer). */
  hasHomeTariff: boolean
}) {
  const t = useTranslations('charging')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [totalRon, setTotalRon] = useState('')
  const [kwh, setKwh] = useState('')
  const [km, setKm] = useState('')
  const [location, setLocation] = useState<ChargeLocation>('HOME')
  const [date, setDate] = useState(todayLocal)
  const [network, setNetwork] = useState('')
  const [socFrom, setSocFrom] = useState('')
  const [socTo, setSocTo] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tariffCanPrice = hasHomeTariff && location === 'HOME'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/charges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalRon: totalRon || undefined,
        kwh: kwh || undefined,
        km: km || undefined,
        location,
        date,
        network: network || undefined,
        socFrom: socFrom || undefined,
        socTo: socTo || undefined,
      }),
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
      const up = await tryFetch(`/api/vehicles/${vehicleId}/charges/${entry.id}/receipt`, { method: 'POST', body: form })
      if (!up?.ok) toast.error(await reasonFor(up, t('receiptFailed')))
    }
    setBusy(false)
    toast.success(t('saved'))
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
        <span className="label" id="charge-location-label">{t('location')}</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="charge-location-label">
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
          <label className="label" htmlFor="charge-total">{t('totalRon')}</label>
          <MoneyInput
            id="charge-total"
            value={totalRon}
            onChange={setTotalRon}
            required={!tariffCanPrice}
            describedBy="charge-total-help"
          />
          <p id="charge-total-help" className="mt-1 text-xs text-ink-faint">
            {tariffCanPrice ? t('totalFromTariffHelp') : t('totalHelp')}
          </p>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="charge-kwh">{t('kwh')}</label>
          <input
            id="charge-kwh"
            type="number"
            inputMode="decimal"
            min={0.01}
            step={0.01}
            required={tariffCanPrice && totalRon === ''}
            className="input"
            value={kwh}
            onChange={(e) => setKwh(e.target.value)}
            aria-describedby="charge-kwh-help"
          />
          <p id="charge-kwh-help" className="mt-1 text-xs text-ink-faint">{t('kwhHelp')}</p>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="charge-km">{t('km')}</label>
          <input
            id="charge-km"
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
            <label className="label" htmlFor="charge-date">{t('date')}</label>
            <input id="charge-date" type="date" required max={todayLocal()} className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="charge-network">{t('network')}</label>
            <input id="charge-network" className="input" maxLength={80} value={network} onChange={(e) => setNetwork(e.target.value)} />
          </div>
          <fieldset className="min-w-0 sm:col-span-2">
            <legend className="label">{t('soc')}</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-faint" htmlFor="charge-soc-from">{t('socFrom')}</label>
                <input id="charge-soc-from" type="number" inputMode="numeric" min={0} max={99} step={1} className="input" value={socFrom} onChange={(e) => setSocFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-ink-faint" htmlFor="charge-soc-to">{t('socTo')}</label>
                <input id="charge-soc-to" type="number" inputMode="numeric" min={1} max={100} step={1} className="input" value={socTo} onChange={(e) => setSocTo(e.target.value)} />
              </div>
            </div>
            <p className="mt-1 text-xs text-ink-faint">{t('socHelp')}</p>
          </fieldset>
          <div className="min-w-0 sm:col-span-2">
            <label className="label" htmlFor="charge-receipt">{t('receipt')}</label>
            {receipt ? (
              <p className="flex flex-wrap items-center gap-2 text-ink">
                <span className="min-w-0 break-all">{t('receiptAttached', { name: receipt.name })}</span>
                <button type="button" className="text-brand-600 hover:underline dark:text-brand-300" onClick={() => setReceipt(null)}>
                  {t('receiptRemove')}
                </button>
              </p>
            ) : (
              <input
                id="charge-receipt"
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
