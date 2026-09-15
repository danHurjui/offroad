'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Vehicle {
  id: string
  make: string
  model: string
  year: number
  generation: string | null
  engine: string | null
  vin: string | null
  isPublic: boolean
}

export default function VehicleEditForm({ vehicle }: { vehicle: Vehicle }) {
  const router = useRouter()
  const [form, setForm] = useState({
    make: vehicle.make,
    model: vehicle.model,
    year: String(vehicle.year),
    generation: vehicle.generation ?? '',
    engine: vehicle.engine ?? '',
    vin: vehicle.vin ?? '',
    isPublic: vehicle.isPublic,
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await fetch(`/api/vehicles/${vehicle.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, year: Number(form.year) }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Could not save changes')
      return
    }
    router.push(`/dashboard/vehicles/${vehicle.id}`)
    router.refresh()
  }

  async function onDelete() {
    if (!confirm('Delete this vehicle and all its tasks and photos? This cannot be undone.')) return
    setDeleting(true)
    await fetch(`/api/vehicles/${vehicle.id}`, { method: 'DELETE' })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="card space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="make">Make</label>
            <input id="make" className="input" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="model">Model</label>
            <input id="model" className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="year">Year</label>
            <input id="year" type="number" className="input" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="generation">Generation</label>
            <input id="generation" className="input" value={form.generation} onChange={(e) => setForm({ ...form, generation: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="engine">Engine</label>
            <input id="engine" className="input" value={form.engine} onChange={(e) => setForm({ ...form, engine: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="vin">VIN / chassis number</label>
            <input id="vin" className="input" value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.isPublic}
            onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
          />
          Make this project public (shareable profile — coming soon)
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <div className="card p-6">
        <h2 className="mb-2 font-semibold text-ink">Danger zone</h2>
        <p className="mb-3 text-sm text-ink-muted">
          Deleting a vehicle removes all its tasks, photos, and history. This cannot be undone.
        </p>
        <button type="button" className="btn-danger" onClick={onDelete} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete vehicle'}
        </button>
      </div>
    </div>
  )
}
