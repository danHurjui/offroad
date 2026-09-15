'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface FoundStatePhoto {
  id: string
  url: string
  caption: string | null
}

interface Initial {
  acquisitionDate: string
  purchasePriceRon: number | null
  odometer: number | null
  knownHistory: string | null
  conditionRating: number | null
  frontNotes: string | null
  rearNotes: string | null
  leftNotes: string | null
  rightNotes: string | null
  roofNotes: string | null
  floorNotes: string | null
  engineNotes: string | null
  interiorNotes: string | null
  photos: FoundStatePhoto[]
}

// RL-008: found state intake — structured baseline for a restoration.
export default function FoundStateForm({ vehicleId, initial }: { vehicleId: string; initial: Initial | null }) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    acquisitionDate: initial?.acquisitionDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    purchasePriceRon: initial?.purchasePriceRon != null ? String(initial.purchasePriceRon) : '',
    odometer: initial?.odometer != null ? String(initial.odometer) : '',
    knownHistory: initial?.knownHistory ?? '',
    conditionRating: initial?.conditionRating != null ? String(initial.conditionRating) : '',
    frontNotes: initial?.frontNotes ?? '',
    rearNotes: initial?.rearNotes ?? '',
    leftNotes: initial?.leftNotes ?? '',
    rightNotes: initial?.rightNotes ?? '',
    roofNotes: initial?.roofNotes ?? '',
    floorNotes: initial?.floorNotes ?? '',
    engineNotes: initial?.engineNotes ?? '',
    interiorNotes: initial?.interiorNotes ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await fetch(`/api/vehicles/${vehicleId}/found-state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        purchasePriceRon: form.purchasePriceRon || undefined,
        odometer: form.odometer || undefined,
        conditionRating: form.conditionRating || undefined,
      }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Could not save')
      return
    }
    router.refresh()
  }

  async function onUploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/vehicles/${vehicleId}/found-state/photos`, { method: 'POST', body: formData })
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (res.ok) router.refresh()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="card space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="acquisitionDate">Acquisition date</label>
            <input id="acquisitionDate" type="date" className="input" value={form.acquisitionDate} onChange={(e) => set('acquisitionDate', e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="purchasePriceRon">Purchase price (RON)</label>
            <input id="purchasePriceRon" type="number" step="0.01" className="input" value={form.purchasePriceRon} onChange={(e) => set('purchasePriceRon', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="odometer">Odometer</label>
            <input id="odometer" type="number" className="input" value={form.odometer} onChange={(e) => set('odometer', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="conditionRating">General condition (1-5)</label>
            <select id="conditionRating" className="input" value={form.conditionRating} onChange={(e) => set('conditionRating', e.target.value)}>
              <option value="">Not rated</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="knownHistory">Known history</label>
          <textarea id="knownHistory" className="input" rows={3} value={form.knownHistory} onChange={(e) => set('knownHistory', e.target.value)} />
        </div>

        <div>
          <p className="label">Panel-by-panel condition notes</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                ['frontNotes', 'Front'],
                ['rearNotes', 'Rear'],
                ['leftNotes', 'Left'],
                ['rightNotes', 'Right'],
                ['roofNotes', 'Roof'],
                ['floorNotes', 'Floor'],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="text-xs text-ink-faint" htmlFor={key}>{label}</label>
                <textarea id={key} className="input" rows={2} value={form[key]} onChange={(e) => set(key, e.target.value)} />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="engineNotes">Engine condition notes</label>
            <textarea id="engineNotes" className="input" rows={2} value={form.engineNotes} onChange={(e) => set('engineNotes', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="interiorNotes">Interior condition notes</label>
            <textarea id="interiorNotes" className="input" rows={2} value={form.interiorNotes} onChange={(e) => set('interiorNotes', e.target.value)} />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'Saving…' : initial ? 'Save changes' : 'Save found state'}
        </button>
      </form>

      {initial && (
        <div className="card p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-ink">Found state photos</h2>
            <label className="btn-secondary cursor-pointer">
              {uploading ? 'Uploading…' : 'Add photo'}
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/heic" className="hidden" onChange={onUploadPhoto} disabled={uploading} />
            </label>
          </div>
          {initial.photos.length === 0 ? (
            <p className="text-sm text-ink-faint">No photos yet — up to 20 allowed.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {initial.photos.map((photo) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={photo.id} src={`/api/uploads/${photo.url}`} alt="" className="aspect-square rounded-lg object-cover" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
