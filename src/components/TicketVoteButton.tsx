'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Vote toggle. Optimistic so the count moves immediately, but it reconciles
 * against the count the server returns — the server is authoritative, since
 * the one-vote-per-user rule lives on a DB constraint there.
 */
export default function TicketVoteButton({
  ticketId,
  initialVoted,
  initialCount,
  signedIn,
  size = 'md',
}: {
  ticketId: string
  initialVoted: boolean
  initialCount: number
  signedIn: boolean
  size?: 'sm' | 'md'
}) {
  const router = useRouter()
  const [voted, setVoted] = useState(initialVoted)
  const [count, setCount] = useState(initialCount)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    if (busy) return
    if (!signedIn) {
      router.push(`/login?callbackUrl=${encodeURIComponent(`/tickets/${ticketId}`)}`)
      return
    }
    setBusy(true)
    const previous = { voted, count }
    setVoted(!voted)
    setCount(count + (voted ? -1 : 1))
    try {
      const res = await fetch(`/api/tickets/${ticketId}/vote`, { method: 'POST' })
      if (!res.ok) throw new Error('vote failed')
      const data = await res.json()
      setVoted(data.voted)
      setCount(data.voteCount)
      router.refresh()
    } catch {
      setVoted(previous.voted)
      setCount(previous.count)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={voted}
      aria-label={voted ? 'Remove your vote' : 'Vote for this'}
      title={signedIn ? undefined : 'Log in to vote'}
      className={`flex shrink-0 flex-col items-center justify-center rounded-lg border-2 transition-colors disabled:opacity-60 ${
        size === 'sm' ? 'w-12 px-1 py-1.5' : 'w-14 px-2 py-2'
      } ${voted ? 'border-brand-500 bg-brand-50 dark:bg-brand-400/10 text-brand-700 dark:text-brand-200' : 'border-surface-border text-ink-muted hover:border-brand-300'}`}
    >
      <span aria-hidden className="text-xs leading-none">
        ▲
      </span>
      <span className={`font-semibold leading-tight ${size === 'sm' ? 'text-sm' : 'text-base'}`}>{count}</span>
    </button>
  )
}
