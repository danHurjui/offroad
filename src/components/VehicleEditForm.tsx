'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AutocompleteInput from './AutocompleteInput'
import FormError from './FormError'
import { MAKE_SUGGESTIONS, modelSuggestionsFor } from '@/lib/vehicleSuggestions'
import type { ProjectType } from '@/lib/projectType'

interface Vehicle {
  id: string
  // Not editable (pitfall #2 — it would orphan every task's vocabulary);
  // it is here only to pick the right make suggestions.
  projectType: ProjectType
  make: string
  model: string
  year: number
  generation: string | null
  engine: string | null
  vin: string | null
  isPublic: boolean
  hideCostsFromCollaborators: boolean
  hidePublicCost: boolean
  slug: string | null
  ownerUsername: string | null
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
    hideCostsFromCollaborators: vehicle.hideCostsFromCollaborators,
    hidePublicCost: vehicle.hidePublicCost,
  })
  const publicUrl = vehicle.ownerUsername && vehicle.slug ? `/builds/${vehicle.ownerUsername}/${vehicle.slug}` : null
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
            <AutocompleteInput
              id="make"
              value={form.make}
              onChange={(make) => setForm({ ...form, make })}
              suggestions={MAKE_SUGGESTIONS[vehicle.projectType]}
              autoCapitalize="words"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="model">Model</label>
            <AutocompleteInput
              id="model"
              value={form.model}
              onChange={(model) => setForm({ ...form, model })}
              suggestions={modelSuggestionsFor(form.make)}
              autoCapitalize="words"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="year">Year</label>
            <input
              id="year"
              name="year"
              type="number"
              className="input"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
              min={1886}
              max={new Date().getFullYear() + 1}
              step={1}
              inputMode="numeric"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="generation">Generation</label>
            <input
              id="generation"
              name="generation"
              className="input"
              value={form.generation}
              onChange={(e) => setForm({ ...form, generation: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label" htmlFor="engine">Engine</label>
            <input
              id="engine"
              name="engine"
              className="input"
              value={form.engine}
              onChange={(e) => setForm({ ...form, engine: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label" htmlFor="vin">VIN / chassis number</label>
            {/* VINs are 17 uppercase alphanumerics with no I/O/Q; uppercasing
                as you type saves a round of "why won't it decode?". */}
            <input
              id="vin"
              name="vin"
              className="input font-mono uppercase"
              value={form.vin}
              onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })}
              maxLength={17}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.isPublic}
              onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
            />
            Make this project public (anyone with the link can view it, read-only)
          </label>
          {form.isPublic && (
            <p className="mt-1 pl-6 text-xs text-ink-faint">
              {publicUrl ? (
                <>
                  Live at <span className="font-mono">{publicUrl}</span>
                </>
              ) : (
                'The public URL will be assigned when you save.'
              )}
            </p>
          )}
        </div>

        {form.isPublic && (
          <label className="flex items-center gap-2 pl-6 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.hidePublicCost}
              onChange={(e) => setForm({ ...form, hidePublicCost: e.target.checked })}
            />
            Hide total cost from the public page
          </label>
        )}

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.hideCostsFromCollaborators}
            onChange={(e) => setForm({ ...form, hideCostsFromCollaborators: e.target.checked })}
          />
          Hide cost totals from collaborators
        </label>

        <FormError>{error}</FormError>
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
