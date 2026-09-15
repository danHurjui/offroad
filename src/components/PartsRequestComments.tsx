'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

interface CommentRow {
  id: string
  body: string
  createdAt: string
  user: { displayName: string }
}

// RL-024: comment thread — "respond with a comment" from the ticket.
export default function PartsRequestComments({
  partsRequestId,
  comments: initialComments,
}: {
  partsRequestId: string
  comments: CommentRow[]
}) {
  const router = useRouter()
  const { status } = useSession()
  const [comments, setComments] = useState(initialComments)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setError(null)
    setLoading(true)
    const res = await fetch(`/api/parts-requests/${partsRequestId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Could not post reply')
      return
    }
    const created = await res.json()
    setComments((prev) => [...prev, { id: created.id, body: created.body, createdAt: created.createdAt, user: created.user }])
    setBody('')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-ink">Replies ({comments.length})</h2>
      {comments.length === 0 ? (
        <p className="text-sm text-ink-faint">No replies yet.</p>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="card p-3">
              <p className="text-sm text-ink">{c.body}</p>
              <p className="mt-1 text-xs text-ink-faint">
                {c.user.displayName} · {new Date(c.createdAt).toLocaleDateString('ro-RO')}
              </p>
            </div>
          ))}
        </div>
      )}

      {status === 'authenticated' ? (
        <form onSubmit={onSubmit} className="space-y-2">
          <textarea
            className="input"
            rows={3}
            placeholder="Know where to find this part? Reply here."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading || !body.trim()}>
            {loading ? 'Posting…' : 'Reply'}
          </button>
        </form>
      ) : (
        <Link href="/login" className="text-sm text-brand-600 hover:underline">
          Log in to reply
        </Link>
      )}
    </div>
  )
}
