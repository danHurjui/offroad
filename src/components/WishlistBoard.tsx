'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PROJECT_TYPE_CONFIG, labelFor, type ProjectType } from '@/lib/projectType'

interface WishlistItem {
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

const RESTORATION_STATUS_COLORS: Record<string, string> = {
  HUNTING: 'bg-amber-100 text-amber-800',
  LOCATED: 'bg-blue-100 text-blue-800',
  RESERVED: 'bg-purple-100 text-purple-800',
  PURCHASED: 'bg-green-100 text-green-800',
  FITTED: 'bg-surface-subtle text-ink-muted',
}
const OFFROAD_STATUS_COLORS: Record<string, string> = {
  RESEARCHING: 'bg-slate-100 text-slate-700',
  SOURCED: 'bg-blue-100 text-blue-800',
  ORDERED: 'bg-amber-100 text-amber-800',
  INSTALLED: 'bg-green-100 text-green-800',
}

// RL-011/012: budget total, category breakdown, drag-to-reorder (with
// up/down buttons as a touch-friendly fallback — native HTML5 drag events
// are unreliable on mobile), status badges, and the "mark as
// installed/fitted" convert-to-task action.
export default function WishlistBoard({
  vehicleId,
  projectType,
  items: initialItems,
}: {
  vehicleId: string
  projectType: ProjectType
  items: WishlistItem[]
}) {
  const router = useRouter()
  const config = PROJECT_TYPE_CONFIG[projectType]
  const statusColors = projectType === 'RESTORATION' ? RESTORATION_STATUS_COLORS : OFFROAD_STATUS_COLORS
  const terminalStatus = config.wishlistStatuses[config.wishlistStatuses.length - 1].value
  const convertLabel = projectType === 'RESTORATION' ? 'Mark as fitted' : 'Mark as installed'

  const [items, setItems] = useState(initialItems)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const totalBudget = items.reduce((sum, i) => sum + (i.estimatedCostRon ?? 0), 0)
  const byCategory = new Map<string, number>()
  for (const item of items) {
    const key = item.category ?? '—'
    byCategory.set(key, (byCategory.get(key) ?? 0) + (item.estimatedCostRon ?? 0))
  }

  async function persistOrder(next: WishlistItem[]) {
    setItems(next)
    await fetch(`/api/vehicles/${vehicleId}/wishlist/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: next.map((i) => i.id) }),
    })
    router.refresh()
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    persistOrder(next)
  }

  function onDrop(index: number) {
    if (dragIndex === null || dragIndex === index) return
    const next = [...items]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(index, 0, moved)
    setDragIndex(null)
    persistOrder(next)
  }

  async function onConvert(item: WishlistItem) {
    if (!confirm(`${convertLabel}? This creates a task from this item.`)) return
    setBusyId(item.id)
    const res = await fetch(`/api/vehicles/${vehicleId}/wishlist/${item.id}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    setBusyId(null)
    if (res.ok) {
      const task = await res.json()
      router.push(`/dashboard/vehicles/${vehicleId}/tasks/${task.id}`)
      router.refresh()
      return
    }
    const data = await res.json()
    alert(data.error ?? 'Could not convert item')
  }

  async function onDelete(item: WishlistItem) {
    if (!confirm(`Delete "${item.name}"?`)) return
    setBusyId(item.id)
    await fetch(`/api/vehicles/${vehicleId}/wishlist/${item.id}`, { method: 'DELETE' })
    setBusyId(null)
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    router.refresh()
  }

  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card p-4">
          <div className="text-xs text-ink-faint">Total {config.wishlistLabel.toLowerCase()} budget</div>
          <div className="text-lg font-semibold text-ink">{totalBudget.toLocaleString('ro-RO')} RON</div>
        </div>
        <div className="card p-4">
          <div className="mb-1 text-xs text-ink-faint">By category</div>
          {byCategory.size === 0 ? (
            <div className="text-sm text-ink-faint">No items yet</div>
          ) : (
            <ul className="space-y-0.5 text-sm">
              {Array.from(byCategory.entries()).map(([category, sum]) => (
                <li key={category} className="flex justify-between">
                  <span className="text-ink-muted">{labelFor(config.categories, category)}</span>
                  <span className="text-ink">{sum.toLocaleString('ro-RO')} RON</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card p-10 text-center text-ink-muted">
          Nothing on your {config.wishlistLabel.toLowerCase()} yet.
        </div>
      ) : (
        <div className="card divide-y divide-surface-border">
          {items.map((item, index) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(index)}
              className="flex items-center gap-3 p-4"
            >
              <div className="flex shrink-0 flex-col text-ink-faint">
                <button type="button" aria-label="Move up" onClick={() => move(index, -1)} disabled={index === 0} className="disabled:opacity-30">
                  ▲
                </button>
                <button type="button" aria-label="Move down" onClick={() => move(index, 1)} disabled={index === items.length - 1} className="disabled:opacity-30">
                  ▼
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{item.name}</span>
                  {item.hardToFind && <span className="badge bg-red-100 text-red-700">Hard to find</span>}
                  <span className={`badge ${statusColors[item.status] ?? 'bg-surface-subtle text-ink-muted'}`}>
                    {labelFor(config.wishlistStatuses, item.status)}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-faint">
                  {item.category && <span>{labelFor(config.categories, item.category)}</span>}
                  {item.estimatedCostRon != null && <span>{item.estimatedCostRon.toLocaleString('ro-RO')} RON</span>}
                  {item.supplierUrl && (
                    <a href={item.supplierUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                      Supplier link
                    </a>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                {item.status !== terminalStatus && (
                  <button type="button" className="btn-secondary" onClick={() => onConvert(item)} disabled={busyId === item.id}>
                    {convertLabel}
                  </button>
                )}
                <Link href={`/dashboard/vehicles/${vehicleId}/wishlist/${item.id}/edit`} className="btn-secondary">
                  Edit
                </Link>
                <button type="button" className="btn-danger" onClick={() => onDelete(item)} disabled={busyId === item.id}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
