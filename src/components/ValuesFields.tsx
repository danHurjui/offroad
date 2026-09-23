'use client'

import { useTranslations } from 'next-intl'
import { FINANCE_TYPES } from '@/lib/costKinds'
import MoneyInput from './MoneyInput'

export interface ValuesValues {
  purchaseDate: string
  purchasePriceRon: string
  currentValueRon: string
  financeType: string
  financeMonthlyRon: string
  financeStartDate: string
  financeEndDate: string
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
const amount = (n: number | null) => (n == null ? '' : String(n))

/**
 * What the form sends. With no finance type the finance fields go as
 * empty, so switching finance off clears them rather than leaving stale
 * payments behind the select.
 */
export function valuesPayload(values: ValuesValues): ValuesValues {
  if (values.financeType) return values
  return { ...values, financeMonthlyRon: '', financeStartDate: '', financeEndDate: '' }
}

/** Form state from what the server holds. */
export function valuesFrom(vehicle: {
  purchaseDate: string | null
  purchasePriceRon: number | null
  currentValueRon: number | null
  financeType: string | null
  financeMonthlyRon: number | null
  financeStartDate: string | null
  financeEndDate: string | null
}): ValuesValues {
  return {
    purchaseDate: day(vehicle.purchaseDate),
    purchasePriceRon: amount(vehicle.purchasePriceRon),
    currentValueRon: amount(vehicle.currentValueRon),
    financeType: vehicle.financeType ?? '',
    financeMonthlyRon: amount(vehicle.financeMonthlyRon),
    financeStartDate: day(vehicle.financeStartDate),
    financeEndDate: day(vehicle.financeEndDate),
  }
}

/**
 * RL-050 values and finance, which RL-045's cost of ownership reads. The
 * current value is the owner's own estimate and says so, with the day it
 * was last changed; RigLog never suggests one.
 */
export default function ValuesFields({
  values,
  onChange,
  currentValueAt,
}: {
  values: ValuesValues
  onChange: (values: ValuesValues) => void
  currentValueAt: string | null
}) {
  const t = useTranslations('vehicleValues')
  const set = (patch: Partial<ValuesValues>) => onChange({ ...values, ...patch })
  const today = new Date().toISOString().slice(0, 10)

  return (
    <fieldset id="values" className="scroll-mt-20 space-y-4">
      <legend className="mb-1 font-semibold text-ink">{t('heading')}</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="purchaseDate">{t('purchaseDate')}</label>
          <input id="purchaseDate" type="date" className="input" max={today} value={values.purchaseDate} onChange={(e) => set({ purchaseDate: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="purchasePriceRon">{t('purchasePriceRon')}</label>
          <MoneyInput id="purchasePriceRon" value={values.purchasePriceRon} onChange={(purchasePriceRon) => set({ purchasePriceRon })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="currentValueRon">{t('currentValueRon')}</label>
          <MoneyInput
            id="currentValueRon"
            value={values.currentValueRon}
            onChange={(currentValueRon) => set({ currentValueRon })}
            describedBy="currentValue-help"
          />
          <p id="currentValue-help" className="mt-1 text-xs text-ink-faint">
            {currentValueAt
              ? t('currentValueHelpDated', { date: new Date(currentValueAt).toLocaleDateString('ro-RO', { timeZone: 'UTC' }) })
              : t('currentValueHelp')}
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="financeType">{t('financeType')}</label>
          <select id="financeType" className="input" value={values.financeType} onChange={(e) => set({ financeType: e.target.value })}>
            <option value="">{t('financeNone')}</option>
            {FINANCE_TYPES.map((code) => (
              <option key={code} value={code}>{t(`finance.${code}`)}</option>
            ))}
          </select>
        </div>
        {values.financeType && (
          <>
            <div>
              <label className="label" htmlFor="financeMonthlyRon">{t('financeMonthlyRon')}</label>
              <MoneyInput id="financeMonthlyRon" value={values.financeMonthlyRon} onChange={(financeMonthlyRon) => set({ financeMonthlyRon })} />
            </div>
            <div>
              <label className="label" htmlFor="financeStartDate">{t('financeStartDate')}</label>
              <input id="financeStartDate" type="date" className="input" max={today} value={values.financeStartDate} onChange={(e) => set({ financeStartDate: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="financeEndDate">{t('financeEndDate')}</label>
              <input id="financeEndDate" type="date" className="input" min={values.financeStartDate || undefined} value={values.financeEndDate} onChange={(e) => set({ financeEndDate: e.target.value })} />
            </div>
            <p className="text-xs text-ink-faint sm:col-span-2">{t(values.financeType === 'CREDIT' ? 'creditHelp' : 'leasingHelp')}</p>
          </>
        )}
      </div>
    </fieldset>
  )
}
