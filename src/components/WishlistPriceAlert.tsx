'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { useChartTheme } from './useChartTheme'
import FormError from './FormError'

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

function formatRon(value: unknown): string {
  return `${Number(value).toLocaleString('ro-RO')} RON`
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
      setError(data.error ?? 'Could not log price')
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
        <label className="label" htmlFor="targetPriceRon">Target price (RON)</label>
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
            placeholder="e.g. 500"
          />
          <button type="submit" className="btn-secondary shrink-0" disabled={savingTarget}>
            {savingTarget ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-ink-faint">
          You&apos;ll get an email (and a push notification, if enabled) the first time you log a price at or below
          this target.
          {item.supplierUrl && (
            <>
              {' '}
              <a href={item.supplierUrl} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-300 hover:underline">
                Check the supplier link
              </a>
              .
            </>
          )}
        </p>
      </form>

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-ink-muted">Price history</span>
          {lowestPrice != null && <span className="text-sm font-semibold text-ink">Lowest: {formatRon(lowestPrice)}</span>}
        </div>
        {priceHistory.length === 0 ? (
          <p className="text-sm text-ink-faint">No prices logged yet.</p>
        ) : priceHistory.length === 1 ? (
          <p className="text-sm text-ink">{formatRon(priceHistory[0].priceRon)} on {new Date(priceHistory[0].recordedAt).toLocaleDateString('ro-RO')}</p>
        ) : (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={priceHistory.map((e) => ({ date: new Date(e.recordedAt).toLocaleDateString('ro-RO'), price: e.priceRon }))}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="date" fontSize={11} tick={{ fill: chart.axis }} />
                <YAxis fontSize={11} tickFormatter={formatRon} width={70} tick={{ fill: chart.axis }} />
                <Tooltip
                  formatter={formatRon}
                  contentStyle={{ backgroundColor: chart.tooltipBg, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 8 }}
                  itemStyle={{ color: chart.axis }}
                  labelStyle={{ color: chart.axis }}
                />
                {item.targetPriceRon != null && (
                  <ReferenceLine y={item.targetPriceRon} stroke={chart.positive} strokeDasharray="4 4" label="Target" />
                )}
                <Line type="monotone" dataKey="price" stroke={chart.accent} strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <form onSubmit={onLogPrice} className="card space-y-3 p-4">
        <span className="label">I found it at this price</span>
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
            placeholder="Price (RON)"
            aria-label="Price in RON"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            required
          />
          <input
            id="newNote"
            name="newNote"
            type="text"
            className="input"
            placeholder="Note (optional) — e.g. emag.ro"
            aria-label="Note about where you found this price"
            autoComplete="off"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
          />
        </div>
        <FormError>{error}</FormError>
        <button type="submit" className="btn-primary w-full" disabled={logging}>
          {logging ? 'Logging…' : 'Log price'}
        </button>
      </form>
    </div>
  )
}
