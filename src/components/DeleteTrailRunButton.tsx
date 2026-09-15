'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteTrailRunButton({ vehicleId, runId }: { vehicleId: string; runId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function onDelete() {
    if (!confirm('Delete this trail run? This cannot be undone.')) return
    setLoading(true)
    await fetch(`/api/vehicles/${vehicleId}/trail-runs/${runId}`, { method: 'DELETE' })
    router.push(`/dashboard/vehicles/${vehicleId}/trail-log`)
    router.refresh()
  }

  return (
    <button type="button" className="btn-danger" onClick={onDelete} disabled={loading}>
      {loading ? 'Deleting…' : 'Delete'}
    </button>
  )
}
