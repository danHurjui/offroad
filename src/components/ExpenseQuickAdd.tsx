'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { EXPENSE_KINDS, type ExpenseKind } from '@/lib/costKinds'
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
 * RL-045: one of the running costs with no better home — road tax, a toll,
 * parking. Amount and kind; the date defaults to today.
 */
export default function ExpenseQuickAdd({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('expenses')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [amountRon, setAmountRon] = useState('')
  const [kind, setKind] = useState<ExpenseKind>('TAX')
  const [date, setDate] = useState(todayLocal)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountRon, kind, date, note: note || undefined }),
    })
    setBusy(false)
    if (!res?.ok) {
      setError(await reasonFor(res, t('saveFailed')))
      return
    }
    toast.success(t('saved'))
    setAmountRon('')
    setNote('')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="min-w-0">
          <label className="label" htmlFor="expense-amount">{t('amount')}</label>
          <MoneyInput id="expense-amount" value={amountRon} onChange={setAmountRon} required />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="expense-kind">{t('kindLabel')}</label>
          <select id="expense-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as ExpenseKind)}>
            {EXPENSE_KINDS.map((k) => (
              <option key={k} value={k}>{t(`kind.${k}`)}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="expense-date">{t('date')}</label>
          <input id="expense-date" type="date" required max={todayLocal()} className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="min-w-0">
        <label className="label" htmlFor="expense-note">{t('note')}</label>
        <input id="expense-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} />
      </div>
      <FormError>{error}</FormError>
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? t('adding') : t('add')}
      </button>
    </form>
  )
}
