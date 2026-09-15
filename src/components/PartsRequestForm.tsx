'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PART_CONDITIONS } from '@/lib/projectType'

// RL-024: parts request form — Pro-gated server-side; this component
// assumes the caller already confirmed the viewer is Pro and logged in.
export default function PartsRequestForm() {
  const router = useRouter()
  const [form, setForm] = useState({
    vehicleMake: '',
    vehicleModel: '',
    partName: '',
    partNumber: '',
    conditionAccepted: PART_CONDITIONS[0].value,
    location: '',
    description: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await fetch('/api/parts-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Could not post request')
      return
    }
    const created = await res.json()
    router.push(`/community/parts-wanted/${created.id}`)
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="vehicleMake">Vehicle make</label>
          <input id="vehicleMake" className="input" value={form.vehicleMake} onChange={(e) => setForm({ ...form, vehicleMake: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="vehicleModel">Vehicle model</label>
          <input id="vehicleModel" className="input" value={form.vehicleModel} onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="partName">Part name</label>
          <input id="partName" className="input" value={form.partName} onChange={(e) => setForm({ ...form, partName: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="partNumber">Part number (optional)</label>
          <input id="partNumber" className="input" value={form.partNumber} onChange={(e) => setForm({ ...form, partNumber: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="conditionAccepted">Condition accepted</label>
          <select id="conditionAccepted" className="input" value={form.conditionAccepted} onChange={(e) => setForm({ ...form, conditionAccepted: e.target.value })}>
            {PART_CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="location">Location / willing to ship</label>
          <input
            id="location"
            className="input"
            placeholder="e.g. Cluj, willing to ship nationwide"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            required
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="description">Description (optional)</label>
        <textarea
          id="description"
          className="input"
          rows={4}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? 'Posting…' : 'Post request'}
      </button>
    </form>
  )
}
