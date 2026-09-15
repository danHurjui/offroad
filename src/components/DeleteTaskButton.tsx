'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteTaskButton({ vehicleId, taskId }: { vehicleId: string; taskId: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function onDelete() {
    if (!confirm('Delete this task and all its photos? This cannot be undone.')) return
    setDeleting(true)
    await fetch(`/api/vehicles/${vehicleId}/tasks/${taskId}`, { method: 'DELETE' })
    router.push(`/dashboard/vehicles/${vehicleId}`)
    router.refresh()
  }

  return (
    <button type="button" className="btn-danger" onClick={onDelete} disabled={deleting}>
      {deleting ? 'Deleting…' : 'Delete'}
    </button>
  )
}
