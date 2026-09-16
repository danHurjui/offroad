'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PROJECT_TYPES, PROJECT_TYPE_CONFIG, type ProjectType } from '@/lib/projectType'
import { compressImageIfNeeded } from '@/lib/compressImage'

// RL-002: create a vehicle / project. Project type selector is prominent —
// large buttons, not a dropdown. Driven by PROJECT_TYPE_CONFIG so a new
// mode shows up here without editing this component.
const PROJECT_TYPE_BLURBS: Record<ProjectType, string> = {
  OFFROAD: 'What have I bolted on?',
  RESTORATION: 'What stage is the car at?',
  DAILY_DRIVER: "What's been fixed, and what's due?",
}
export default function VehicleForm() {
  const router = useRouter()
  const [projectType, setProjectType] = useState<ProjectType | null>(null)
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [generation, setGeneration] = useState('')
  const [engine, setEngine] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!projectType) {
      setError('Choose what kind of vehicle this is')
      return
    }
    setLoading(true)

    const res = await fetch('/api/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectType, make, model, year: Number(year), generation, engine }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Could not create vehicle')
      setLoading(false)
      return
    }

    if (coverFile) {
      const compressed = await compressImageIfNeeded(coverFile)
      const formData = new FormData()
      formData.append('file', compressed)
      await fetch(`/api/vehicles/${data.id}/cover-photo`, { method: 'POST', body: formData })
    }

    router.push(`/dashboard/vehicles/${data.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6">
      <div>
        <label className="label">Project type</label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PROJECT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setProjectType(type)}
              aria-pressed={projectType === type}
              className={`rounded-xl border-2 p-4 text-left transition-colors ${
                projectType === type ? 'border-brand-500 bg-brand-50' : 'border-surface-border'
              }`}
            >
              <div className="font-semibold text-ink">{PROJECT_TYPE_CONFIG[type].label}</div>
              <div className="text-sm text-ink-muted">{PROJECT_TYPE_BLURBS[type]}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="make">Make</label>
          <input id="make" className="input" value={make} onChange={(e) => setMake(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="model">Model</label>
          <input id="model" className="input" value={model} onChange={(e) => setModel(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="year">Year</label>
          <input
            id="year"
            type="number"
            className="input"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            min={1886}
            max={new Date().getFullYear() + 1}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="generation">Generation (optional)</label>
          <input id="generation" className="input" value={generation} onChange={(e) => setGeneration(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="engine">Engine (optional)</label>
          <input id="engine" className="input" value={engine} onChange={(e) => setEngine(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="coverPhoto">Cover photo (optional)</label>
          <input
            id="coverPhoto"
            type="file"
            accept="image/jpeg,image/png,image/heic"
            className="input"
            onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? 'Creating…' : 'Create vehicle'}
      </button>
    </form>
  )
}
