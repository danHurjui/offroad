'use client'

import { useState } from 'react'

export default function UpgradePlanCard({
  plan,
  title,
  price,
  period,
  description,
  highlight,
}: {
  plan: 'MONTHLY' | 'ANNUAL' | 'LIFETIME'
  title: string
  price: string
  period: string
  description: string
  highlight?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onChoose() {
    setError(null)
    setLoading(true)
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not start checkout')
      setLoading(false)
      return
    }
    const { url } = await res.json()
    window.location.href = url
  }

  return (
    <div className={`card flex flex-col p-5 ${highlight ? 'border-brand-500 ring-1 ring-brand-500' : ''}`}>
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <p className="mt-1">
        <span className="text-2xl font-bold text-ink">{price}</span>{' '}
        <span className="text-sm text-ink-muted">{period}</span>
      </p>
      <p className="mt-2 flex-1 text-sm text-ink-muted">{description}</p>
      <button type="button" className="btn-primary mt-4" onClick={onChoose} disabled={loading}>
        {loading ? 'Redirecting…' : 'Choose'}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
