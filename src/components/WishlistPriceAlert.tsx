'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { useChartTheme } from './useChartTheme'
import FormError from './FormError'
import { formatRon } from '@/lib/money'

interface Item {
  id: string
  targetPriceRon: number | null
  supplierUrl: string | null
}

interface PriceEntry {
  id: string
  priceRon: number
  note: string | null
  recordedAt: string
}

function ron(value: unknown, decimals: 0 | 2 = 2): string {
  return formatRon(Number(value), decimals)
}

// RL-026: target price + "I found it at this price" log + history chart.
// No automated scraping — the owner pastes a supplier URL on the base
// item form (existing supplierUrl field) and checks it themselves, then
// logs what they found here.
export default function WishlistPriceAlert({
  vehicleId,
  item,
  priceHistory: initialHistory,
}: {
  vehicleId: string
  item: Item
  priceHistory: PriceEntry[]
}) {
  const t = useTranslations('priceAlert')
  const tc = useTranslations('common')
  const router = useRouter()
  const chart = useChartTheme()
  const [targetPriceRon, setTargetPriceRon] = useState(item.targetPriceRon != null ? String(item.targetPriceRon) : '')
  const [savingTarget, setSavingTarget] = useState(false)

  const [priceHistory, setPriceHistory] = useState(initialHistory)
  const [newPrice, setNewPrice] = useState('')
  const [newNote, setNewNote] = useState('')
  const [logging, setLogging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lowestPrice = priceHistory.reduce<number | null>(
    (min, e) => (min === null || e.priceRon < min ? e.priceRon : min),
    null
  )

  async function onSaveTarget(e: React.FormEvent) {
    e.preventDefault()
    setSavingTarget(true)
    await fetch(`/api/vehicles/${vehicleId}/wishlist/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPriceRon: targetPriceRon !== '' ? Number(targetPriceRon) : null }),
    })
    setSavingTarget(false)
    router.refresh()
  }

  async function onLogPrice(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!newPrice) return
    setLogging(true)
    const res = await fetch(`/api/vehicles/${vehicleId}/wishlist/${item.id}/price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceRon: Number(newPrice), note: newNote || undefined }),
    })
    const data = await res.json()
    setLogging(false)
    if (!res.ok) {
      setError(data.error ?? t('logFailed'))
      return
    }
    setPriceHistory((prev) => [...prev, data])
    setNewPrice('')
    setNewNote('')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSaveTarget} className="card space-y-3 p-4">
        <label className="label" htmlFor="targetPriceRon">{t('targetPrice')}</label>
        <div className="flex gap-2">
          <input
            id="targetPriceRon"
            name="targetPriceRon"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            autoComplete="off"
            className="input"
            value={targetPriceRon}
            onChange={(e) => setTargetPriceRon(e.target.value)}
            placeholder={t('targetPlaceholder')}
          />
          <button type="submit" className="btn-secondary shrink-0" disabled={savingTarget}>
            {savingTarget ? tc('saving') : tc('save')}
          </button>
        </div>
        <p className="text-xs text-ink-faint">
          {t('targetHelp')}
          {item.supplierUrl && (
            <>
              {' '}
              <a href={item.supplierUrl} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-300 hover:underline">
                {t('checkSupplier')}
              </a>
              .
            </>
          )}
        </p>
      </form>

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-ink-muted">{t('priceHistory')}</span>
          {lowestPrice != null && <span className="text-sm font-semibold text-ink">
              {t('lowest', { price: ron(lowestPrice) })}
            </span>}
        </div>
        {priceHistory.length === 0 ? (
          <p className="text-sm text-ink-faint">{t('empty')}</p>
        ) : priceHistory.length === 1 ? (
          <p className="text-sm text-ink">
            {t('singleEntry', {
              price: ron(priceHistory[0].priceRon),
              date: new Date(priceHistory[0].recordedAt).toLocaleDateString('ro-RO'),
            })}
          </p>
        ) : (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={priceHistory.map((e) => ({ date: new Date(e.recordedAt).toLocaleDateString('ro-RO'), price: e.priceRon }))}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="date" fontSize={11} tick={{ fill: chart.axis }} />
                <YAxis fontSize={11} tickFormatter={(v) => ron(v, 0)} width={70} tick={{ fill: chart.axis }} />
                <Tooltip
                  formatter={(v) => ron(v)}
                  contentStyle={{ backgroundColor: chart.tooltipBg, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 8 }}
                  itemStyle={{ color: chart.axis }}
                  labelStyle={{ color: chart.axis }}
                />
                {item.targetPriceRon != null && (
                  <ReferenceLine y={item.targetPriceRon} stroke={chart.positive} strokeDasharray="4 4" label={t('target')} />
                )}
                <Line type="monotone" dataKey="price" stroke={chart.accent} strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <form onSubmit={onLogPrice} className="card space-y-3 p-4">
        <span className="label">{t('foundAtThisPrice')}</span>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            id="newPrice"
            name="newPrice"
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            autoComplete="off"
            className="input"
            placeholder={t('pricePlaceholder')}
            aria-label={t('priceAria')}
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            required
          />
          <input
            id="newNote"
            name="newNote"
            type="text"
            className="input"
            placeholder={t('notePlaceholder')}
            aria-label={t('noteAria')}
            autoComplete="off"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
          />
        </div>
        <FormError>{error}</FormError>
        <button type="submit" className="btn-primary w-full" disabled={logging}>
          {logging ? t('logging') : t('logPrice')}
        </button>
      </form>
    </div>
  )
}
