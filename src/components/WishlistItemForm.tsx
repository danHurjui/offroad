'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PROJECT_TYPE_CONFIG, PART_CONDITIONS, type ProjectType } from '@/lib/projectType'

interface InitialItem {
  id: string
  name: string
  category: string | null
  estimatedCostRon: number | null
  status: string
  partCondition: string | null
  supplierUrl: string | null
  notes: string | null
  hardToFind: boolean
}

// RL-011 (wishlist) / RL-012 (parts hunt) add/edit form. Category is a
// required select here (not the free-text-optional field the ticket
// lists) so every item can always be converted to a task later without
// an extra "pick a category" step at convert time — see convert/route.ts.
export default function WishlistItemForm({
  vehicleId,
  projectType,
  initialItem,
}: {
  vehicleId: string
  projectType: ProjectType
  initialItem?: InitialItem
}) {
  const router = useRouter()
  const config = PROJECT_TYPE_CONFIG[projectType]
  const isEdit = Boolean(initialItem)

  const [name, setName] = useState(initialItem?.name ?? '')
  const [category, setCategory] = useState(initialItem?.category ?? config.categories[0].value)
  const [estimatedCostRon, setEstimatedCostRon] = useState(
    initialItem?.estimatedCostRon != null ? String(initialItem.estimatedCostRon) : ''
  )
  const [status, setStatus] = useState(initialItem?.status ?? config.wishlistStatuses[0].value)
  const [partCondition, setPartCondition] = useState(initialItem?.partCondition ?? '')
  const [supplierUrl, setSupplierUrl] = useState(initialItem?.supplierUrl ?? '')
  const [notes, setNotes] = useState(initialItem?.notes ?? '')
  const [hardToFind, setHardToFind] = useState(initialItem?.hardToFind ?? false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const body = {
      name,
      category,
      estimatedCostRon: estimatedCostRon !== '' ? Number(estimatedCostRon) : undefined,
      status,
      partCondition: projectType === 'RESTORATION' ? partCondition || undefined : undefined,
      supplierUrl: supplierUrl || undefined,
      notes: notes || undefined,
      hardToFind,
    }

    const url = isEdit
      ? `/api/vehicles/${vehicleId}/wishlist/${initialItem!.id}`
      : `/api/vehicles/${vehicleId}/wishlist`
    const res = await fetch(url, {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(data.error ?? 'Could not save item')
      return
    }

    router.push(`/dashboard/vehicles/${vehicleId}/wishlist`)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-6">
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="category">Category</label>
          <select id="category" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {config.categories.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {config.wishlistStatuses.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="estimatedCostRon">Estimated cost (RON)</label>
          <input
            id="estimatedCostRon"
            type="number"
            step="0.01"
            className="input"
            value={estimatedCostRon}
            onChange={(e) => setEstimatedCostRon(e.target.value)}
          />
        </div>
        {projectType === 'RESTORATION' && (
          <div>
            <label className="label" htmlFor="partCondition">Part condition</label>
            <select id="partCondition" className="input" value={partCondition} onChange={(e) => setPartCondition(e.target.value)}>
              <option value="">Not specified</option>
              {PART_CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="label" htmlFor="supplierUrl">Supplier URL (optional)</label>
        <input id="supplierUrl" type="url" className="input" value={supplierUrl} onChange={(e) => setSupplierUrl(e.target.value)} />
      </div>

      <div>
        <label className="label" htmlFor="notes">
          {projectType === 'RESTORATION' ? 'Sourcing notes (optional)' : 'Notes (optional)'}
        </label>
        <textarea id="notes" className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {projectType === 'RESTORATION' && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={hardToFind} onChange={(e) => setHardToFind(e.target.checked)} />
          Hard to find
        </label>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Add item'}
      </button>
    </form>
  )
}
