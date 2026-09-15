'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function MarkFoundButton({ partsRequestId }: { partsRequestId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function onMarkFound() {
    if (!confirm('Mark this request as found? It will be removed from the active list.')) return
    setLoading(true)
    await fetch(`/api/parts-requests/${partsRequestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'FOUND' }),
    })
    setLoading(false)
    router.refresh()
  }

  return (
    <button type="button" className="btn-secondary" onClick={onMarkFound} disabled={loading}>
      {loading ? 'Saving…' : 'Mark as found'}
    </button>
  )
}
