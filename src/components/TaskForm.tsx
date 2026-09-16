'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PROJECT_TYPE_CONFIG, ORIGINALITY_CONDITIONS, type ProjectType } from '@/lib/projectType'

interface InitialTask {
  id: string
  name: string
  brand: string | null
  category: string
  status: string
  workType: 'DIY' | 'WORKSHOP'
  costRon: number | null
  partsCostRon: number | null
  labourCostRon: number | null
  date: string
  notes: string | null
  supplierUrl: string | null
  workshopName: string | null
  workshopContact: string | null
  originalityCondition: string | null
}

export default function TaskForm({
  vehicleId,
  projectType,
  initialTask,
  collaboratorLabel,
}: {
  vehicleId: string
  projectType: ProjectType
  initialTask?: InitialTask
  /** RL-032: when a collaborator (not the owner) is adding a task, prefill
   * work type as Workshop and the workshop name with their invite label —
   * most mechanic/specialist collaborators are logging their own shop's
   * work, not DIY. Owners never get this prop. */
  collaboratorLabel?: string | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const config = PROJECT_TYPE_CONFIG[projectType]
  const isEdit = Boolean(initialTask)

  const [name, setName] = useState(initialTask?.name ?? '')
  const [brand, setBrand] = useState(initialTask?.brand ?? '')
  const [category, setCategory] = useState(
    initialTask?.category ?? searchParams.get('category') ?? config.categories[0].value
  )
  const [status, setStatus] = useState(initialTask?.status ?? config.statusTags[0].value)
  const [workType, setWorkType] = useState<'DIY' | 'WORKSHOP'>(
    initialTask?.workType ?? (collaboratorLabel !== undefined ? 'WORKSHOP' : 'DIY')
  )
  const [costRon, setCostRon] = useState(initialTask?.costRon != null ? String(initialTask.costRon) : '')
  const [partsCostRon, setPartsCostRon] = useState(initialTask?.partsCostRon != null ? String(initialTask.partsCostRon) : '')
  const [labourCostRon, setLabourCostRon] = useState(initialTask?.labourCostRon != null ? String(initialTask.labourCostRon) : '')
  const [date, setDate] = useState(initialTask?.date ? initialTask.date.slice(0, 10) : new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState(initialTask?.notes ?? '')
  const [supplierUrl, setSupplierUrl] = useState(initialTask?.supplierUrl ?? '')
  const [workshopName, setWorkshopName] = useState(initialTask?.workshopName ?? collaboratorLabel ?? '')
  const [workshopContact, setWorkshopContact] = useState(initialTask?.workshopContact ?? '')
  const [originalityCondition, setOriginalityCondition] = useState(initialTask?.originalityCondition ?? '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const totalCost =
    workType === 'WORKSHOP'
      ? (Number(partsCostRon) || 0) + (Number(labourCostRon) || 0)
      : Number(costRon) || 0

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (workType === 'WORKSHOP' && !workshopName) {
      setError('Workshop name is required when work type is Workshop')
      return
    }
    setLoading(true)

    const body = {
      name,
      brand: brand || undefined,
      category,
      status,
      workType,
      costRon: workType === 'DIY' && costRon !== '' ? Number(costRon) : undefined,
      partsCostRon: workType === 'WORKSHOP' && partsCostRon !== '' ? Number(partsCostRon) : undefined,
      labourCostRon: workType === 'WORKSHOP' && labourCostRon !== '' ? Number(labourCostRon) : undefined,
      date,
      notes: notes || undefined,
      supplierUrl: supplierUrl || undefined,
      workshopName: workType === 'WORKSHOP' ? workshopName : undefined,
      workshopContact: workType === 'WORKSHOP' ? workshopContact || undefined : undefined,
      originalityCondition: originalityCondition || undefined,
    }

    const url = isEdit
      ? `/api/vehicles/${vehicleId}/tasks/${initialTask!.id}`
      : `/api/vehicles/${vehicleId}/tasks`
    const res = await fetch(url, {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(data.error ?? 'Could not save task')
      return
    }

    router.push(`/dashboard/vehicles/${vehicleId}/tasks/${data.id}`)
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
            {config.statusTags.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="date">Date</label>
          <input id="date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="brand">Brand (optional)</label>
          <input id="brand" className="input" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="label">Work type</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setWorkType('DIY')}
            className={`btn ${workType === 'DIY' ? 'bg-brand-500 text-white' : 'bg-surface-subtle text-ink'}`}
          >
            DIY
          </button>
          <button
            type="button"
            onClick={() => setWorkType('WORKSHOP')}
            className={`btn ${workType === 'WORKSHOP' ? 'bg-brand-500 text-white' : 'bg-surface-subtle text-ink'}`}
          >
            Workshop
          </button>
        </div>
      </div>

      {workType === 'DIY' ? (
        <div>
          <label className="label" htmlFor="costRon">Cost (RON, optional)</label>
          <input id="costRon" type="number" step="0.01" className="input" value={costRon} onChange={(e) => setCostRon(e.target.value)} />
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border border-surface-border p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="workshopName">Workshop name</label>
              <input id="workshopName" className="input" value={workshopName} onChange={(e) => setWorkshopName(e.target.value)} required={workType === 'WORKSHOP'} />
            </div>
            <div>
              <label className="label" htmlFor="workshopContact">Workshop contact (optional)</label>
              <input id="workshopContact" className="input" value={workshopContact} onChange={(e) => setWorkshopContact(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="partsCostRon">Parts cost (RON)</label>
              <input id="partsCostRon" type="number" step="0.01" className="input" value={partsCostRon} onChange={(e) => setPartsCostRon(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="labourCostRon">Labour cost (RON)</label>
              <input id="labourCostRon" type="number" step="0.01" className="input" value={labourCostRon} onChange={(e) => setLabourCostRon(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      <p className="text-sm text-ink-muted">Total cost: <span className="font-semibold text-ink">{totalCost.toLocaleString('ro-RO')} RON</span></p>

      <div>
        <label className="label" htmlFor="supplierUrl">Supplier URL (optional)</label>
        <input id="supplierUrl" type="url" className="input" value={supplierUrl} onChange={(e) => setSupplierUrl(e.target.value)} />
      </div>

      {projectType === 'RESTORATION' && (
        <div>
          <label className="label" htmlFor="originalityCondition">Part condition (optional)</label>
          <select id="originalityCondition" className="input" value={originalityCondition} onChange={(e) => setOriginalityCondition(e.target.value)}>
            <option value="">Not rated</option>
            {ORIGINALITY_CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="label" htmlFor="notes">Notes (optional)</label>
        <textarea id="notes" className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Add task'}
      </button>
    </form>
  )
}
